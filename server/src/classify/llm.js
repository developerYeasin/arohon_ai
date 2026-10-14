// LLM classification pass over questions the rule engine left unclassified (Message Batches API, 50% price).
//   node src/classify/llm.js submit [--limit N] [--model ID]   send unclassified questions, 25 per request
//   node src/classify/llm.js status                            show batches still processing
//   node src/classify/llm.js collect                           apply finished batches (audit-logged)
// Same safety rules as the rule engine: only classification fields change, confidence < 85 is not applied,
// suspected answer keys and broken questions are only flagged, academic/admission questions keep their subject.
import Anthropic from '@anthropic-ai/sdk';
import { pool } from '../db.js';
import { APPLY_MIN } from './rules.js';

const client = new Anthropic();
const args = process.argv.slice(2);
const cmd = args[0];
const arg = (k, d) => { const i = args.indexOf(k); return i > -1 ? args[i + 1] : d; };
const MODEL = arg('--model', 'claude-opus-5-5');
const CHUNK = 25;

// Job-track subjects a question may be (re)assigned to. Keys are what the model returns.
const JOB_SUBJECTS = {
  bangla: 1, english: 2, math: 3, mental_ability: 4, bangladesh_affairs: 5, international_affairs: 6,
  geography_environment: 7, ethics_governance: 8, general_science: 9, ict: 10,
};
const Q_TYPES = ['conceptual', 'calculation', 'grammar', 'vocabulary', 'comprehension', 'factual_recall', 'analytical_reasoning', 'problem_solving'];

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'subject', 'topic_en', 'topic_bn', 'subtopic_en', 'subtopic_bn', 'q_type', 'difficulty', 'confidence', 'status', 'answer_key_suspect', 'reason'],
        properties: {
          id: { type: 'integer' },
          subject: { type: 'string', enum: [...Object.keys(JOB_SUBJECTS), 'keep'] },
          topic_en: { type: 'string' },
          topic_bn: { type: 'string' },
          subtopic_en: { type: 'string' },
          subtopic_bn: { type: 'string' },
          q_type: { type: 'string', enum: Q_TYPES },
          difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
          confidence: { type: 'integer' },
          status: { type: 'string', enum: ['ok', 'ambiguous', 'insufficient'] },
          answer_key_suspect: { type: 'boolean' },
          reason: { type: 'string' },
        },
      },
    },
  },
};

async function taxonomyText() {
  const [rows] = await pool.query(`SELECT s.name_en subject, t.name_en topic, GROUP_CONCAT(DISTINCT st.name_en ORDER BY st.name_en SEPARATOR '; ') subs
    FROM topics t JOIN subjects s ON s.id=t.subject_id LEFT JOIN subtopics st ON st.topic_id=t.id
    WHERE t.kind='concept' GROUP BY s.name_en, t.name_en ORDER BY s.name_en, t.name_en`);
  return rows.map((r) => `- ${r.subject} → ${r.topic}: ${r.subs || ''}`).join('\n');
}

function systemPrompt(taxonomy) {
  return `You classify multiple-choice questions for Arohon, an exam-prep platform for Bangladesh (BCS, bank, primary, NTRCA and other job exams; university admission; SSC/HSC academic).

Classify each question by what it actually tests, never by the book or sheet it came from (the "filed_under" label is often a book name and is frequently wrong). A Bengali-worded question about English grammar is English. A question with numbers is not automatically maths. A question about who wrote a Bangla book is Bangla literature.

For each question return:
- subject: for track "job", pick the subject that matches the tested knowledge from: ${Object.keys(JOB_SUBJECTS).join(', ')}. For track "academic" or "admission", return "keep" (its subject stays; you classify topic and subtopic within it).
- topic_en/topic_bn and subtopic_en/subtopic_bn: reuse an existing name from the taxonomy below whenever it fits, spelled exactly the same. Only when nothing fits, create a concise new name in the same style (Title Case English; standard Bengali term). For academic subjects use the NCTB chapter-level concept as the topic.
- q_type, difficulty (for the target exam level).
- confidence 0-100 in your classification: 90+ only when the tested concept is unmistakable; below 70 when it could reasonably belong elsewhere.
- status: "ok"; "ambiguous" if two classifications are equally plausible; "insufficient" if the text is broken, merged with another question, or missing context needed to know what it tests.
- answer_key_suspect: true only if the marked answer looks wrong. Do not fix it, only flag it.
- reason: one short sentence grounded in the question.

Existing taxonomy (Subject → Topic: subtopics):
${taxonomy}`;
}

const render = (q) => JSON.stringify({
  id: q.id, track: q.track, filed_under: `${q.subject} / ${q.topic}`, question: q.body,
  options: { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d }, marked_answer: q.correct_option,
});

async function submit() {
  const limit = Number(arg('--limit', 0)) || 1e9;
  const system = systemPrompt(await taxonomyText());
  const [rows] = await pool.query(`SELECT q.id, s.track, s.name_en subject, t.name_bn topic, q.body, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option
    FROM questions q JOIN subjects s ON s.id=q.subject_id JOIN topics t ON t.id=q.topic_id
    WHERE q.cls_status='unclassified' AND NOT EXISTS (SELECT 1 FROM cls_llm_jobs j WHERE j.collected=0 AND JSON_CONTAINS(j.question_ids, CAST(q.id AS JSON)))
    ORDER BY q.id LIMIT ?`, [limit]);
  // A batch holds up to 100,000 requests / 256 MB; 2,000 requests of 25 questions stays well inside both.
  for (let b = 0; b < rows.length; b += CHUNK * 2000) {
    const slice = rows.slice(b, b + CHUNK * 2000), requests = [], jobs = [];
    for (let i = 0; i < slice.length; i += CHUNK) {
      const chunk = slice.slice(i, i + CHUNK), custom_id = `q${chunk[0].id}-${chunk.at(-1).id}`;
      jobs.push([custom_id, JSON.stringify(chunk.map((q) => q.id))]);
      requests.push({
        custom_id,
        params: {
          model: MODEL,
          max_tokens: 16000,
          output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
          system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: `Classify these ${chunk.length} questions:\n${chunk.map(render).join('\n')}` }],
        },
      });
    }
    const batch = await client.messages.batches.create({ requests });
    await pool.query('INSERT INTO cls_llm_jobs (batch_id, custom_id, question_ids) VALUES ?', [jobs.map((j) => [batch.id, ...j])]);
    console.log(`batch ${batch.id}: ${requests.length} requests, ${slice.length} questions`);
  }
  if (!rows.length) console.log('nothing left to submit');
  await pool.end();
}

async function status() {
  const [ids] = await pool.query('SELECT batch_id, COUNT(*) n FROM cls_llm_jobs WHERE collected=0 GROUP BY batch_id');
  for (const { batch_id: id, n } of ids) {
    const b = await client.messages.batches.retrieve(id);
    console.log(id, b.processing_status, b.request_counts, `${n} requests pending collection`);
  }
  await pool.end();
}

const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const topicCache = new Map(), subCache = new Map();
async function ensureTopic(conn, subjectId, en, bn) {
  const k = `${subjectId}|${norm(en)}`;
  if (topicCache.has(k)) return topicCache.get(k);
  const [rows] = await conn.query("SELECT id, name_en FROM topics WHERE subject_id=? AND kind='concept'", [subjectId]);
  let hit = rows.find((r) => norm(r.name_en) === norm(en));
  if (!hit) {
    const [ins] = await conn.query("INSERT INTO topics (subject_id,name_bn,name_en,kind) VALUES (?,?,?,'concept')", [subjectId, bn || en, en]);
    hit = { id: ins.insertId };
  }
  topicCache.set(k, hit.id); return hit.id;
}
async function ensureSub(conn, topicId, en, bn) {
  const k = `${topicId}|${norm(en)}`;
  if (subCache.has(k)) return subCache.get(k);
  const [rows] = await conn.query('SELECT id, name_en FROM subtopics WHERE topic_id=?', [topicId]);
  let hit = rows.find((r) => norm(r.name_en) === norm(en));
  if (!hit) {
    const [ins] = await conn.query('INSERT INTO subtopics (topic_id,name_bn,name_en) VALUES (?,?,?)', [topicId, bn || en, en]);
    hit = { id: ins.insertId };
  }
  subCache.set(k, hit.id); return hit.id;
}

async function collect() {
  const [ids] = await pool.query('SELECT DISTINCT batch_id FROM cls_llm_jobs WHERE collected=0');
  const stats = { applied: 0, review: 0, ambiguous: 0, insufficient: 0, keySuspect: 0, invalid: 0, failedRequests: 0 };
  for (const { batch_id: id } of ids) {
    const b = await client.messages.batches.retrieve(id);
    if (b.processing_status !== 'ended') { console.log(id, 'still', b.processing_status); continue; }
    const [jobRows] = await pool.query('SELECT custom_id, question_ids FROM cls_llm_jobs WHERE batch_id=? AND collected=0', [id]);
    const jobs = new Map(jobRows.map((j) => [j.custom_id, new Set(typeof j.question_ids === 'string' ? JSON.parse(j.question_ids) : j.question_ids)]));
    for await (const res of await client.messages.batches.results(id)) {
      const expected = jobs.get(res.custom_id);
      if (!expected) continue;
      const msg = res.result.type === 'succeeded' ? res.result.message : null;
      const text = msg && msg.stop_reason === 'end_turn' ? msg.content.find((c) => c.type === 'text')?.text : null;
      let items = null;
      try { items = text ? JSON.parse(text).items : null; } catch { items = null; }
      if (!items) { // failed, refused or truncated: release the questions so a later submit retries them
        stats.failedRequests++;
        await pool.query('DELETE FROM cls_llm_jobs WHERE batch_id=? AND custom_id=?', [id, res.custom_id]);
        continue;
      }
      const ids = [...expected];
      const [qs] = await pool.query(`SELECT q.id, q.subject_id, q.topic_id, s.track FROM questions q JOIN subjects s ON s.id=q.subject_id
        WHERE q.id IN (?) AND q.cls_status='unclassified'`, [ids]);
      const byId = new Map(qs.map((q) => [q.id, q]));
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        for (const it of items) {
          const q = byId.get(it.id);
          if (!q) { stats.invalid++; continue; } // id not in this request, or already classified meanwhile
          byId.delete(it.id);
          const details = JSON.stringify({ ...it, model: MODEL });
          const target = q.track === 'job' ? JOB_SUBJECTS[it.subject] : q.subject_id;
          const conf = Math.max(0, Math.min(100, it.confidence));
          if (it.answer_key_suspect) stats.keySuspect++;
          if (!target || it.status !== 'ok' || conf < APPLY_MIN) {
            const st = it.status === 'insufficient' ? 'insufficient' : it.status === 'ambiguous' || !target ? 'ambiguous' : 'needs_review';
            stats[st === 'needs_review' ? 'review' : st]++;
            await conn.query('UPDATE questions SET cls_status=?, cls_confidence=? WHERE id=?', [st, conf, q.id]);
            await conn.query(`INSERT INTO classification_audit (question_id,old_subject_id,old_topic_id,new_subject_id,confidence,cls_status,reason,method,details)
              VALUES (?,?,?,?,?,?,?,'llm',?)`, [q.id, q.subject_id, q.topic_id, target || null, conf, st, it.reason.slice(0, 255), details]);
            continue;
          }
          const topicId = await ensureTopic(conn, target, it.topic_en, it.topic_bn);
          const subId = await ensureSub(conn, topicId, it.subtopic_en, it.subtopic_bn);
          await conn.query("UPDATE questions SET subject_id=?, topic_id=?, subtopic_id=?, q_type=?, cls_confidence=?, cls_status='auto' WHERE id=?",
            [target, topicId, subId, it.q_type, conf, q.id]);
          await conn.query(`INSERT INTO classification_audit (question_id,old_subject_id,old_topic_id,new_subject_id,new_topic_id,new_subtopic_id,confidence,cls_status,reason,method,details)
            VALUES (?,?,?,?,?,?,?,'auto',?,'llm',?)`, [q.id, q.subject_id, q.topic_id, target, topicId, subId, conf, it.reason.slice(0, 255), details]);
          stats.applied++;
        }
        await conn.query('UPDATE cls_llm_jobs SET collected=1 WHERE batch_id=? AND custom_id=?', [id, res.custom_id]);
        await conn.commit();
      } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
      // Questions the model skipped stay 'unclassified' and are picked up by the next submit.
    }
  }
  console.log(stats);
  await pool.end();
}

const run = { submit, status, collect }[cmd];
if (!run) { console.log('usage: node src/classify/llm.js submit [--limit N] [--model ID] | status | collect'); process.exit(1); }
run().catch((e) => { console.error(e); process.exit(1); });
