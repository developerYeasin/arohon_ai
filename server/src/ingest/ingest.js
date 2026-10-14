// PDF → question bank pipeline. Every step is resumable: progress lives in ingest_files / ingest_pages.
//   npm run ingest -- scan      register every PDF under PDF_DIR (duplicates skipped by SHA-1)
//   npm run ingest -- submit    send pending pages to the Claude Batch API (--limit N pages, default 2000)
//   npm run ingest -- collect   fetch finished batches and store each page's extracted questions
//   npm run ingest -- load      insert extracted questions into the bank (duplicates skipped)
//   npm run ingest -- status    progress summary
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { PDFDocument } from 'pdf-lib';
import { pool, query, one } from '../db.js';
import { migrate } from '../migrate.js';
import { dhakaToday } from '../services/util.js';

const PDF_DIR = process.env.PDF_DIR || path.resolve('..', 'PDF_Files');
const MODEL = process.env.INGEST_MODEL || 'claude-opus-5-5';
const MAX_BATCH_BYTES = 150 * 1024 * 1024; // raw PDF bytes; base64 adds ~33% and a batch caps at 256 MB
const SUBJECTS = ['bangla', 'english', 'math', 'mental-ability', 'bd-affairs', 'intl-affairs', 'geography', 'ethics', 'gen-science', 'ict'];

const PROMPT = `This is one page from a Bangladeshi job-exam preparation book (BCS, bank, NTRCA, primary etc.).
Extract every multiple-choice question on the page. Read from the page image; if the embedded text layer is garbled (old Bijoy/SutonnyMJ encoding), ignore it.

For each question:
- body and options a-d exactly as printed (Unicode Bangla, keep English/formulas as written; use ₂ ³ style sub/superscripts). Drop the question number and ক/খ/গ/ঘ labels.
- book_answer: the answer the book marks (উ. ক → "a", খ → "b", গ → "c", ঘ → "d"), or "none" if not shown.
- correct_answer: the answer you judge correct. confident=false when you are not sure or the question depends on facts that change over time.
- note: in Bangla, one short sentence only when correct_answer differs from book_answer or confident is false; otherwise "".
- subject: the best-fitting subject slug. topic_bn: a short, general Bangla topic name (e.g. "রক্ত ও সংবহনতন্ত্র", "নেটওয়ার্কিং"), reusable across books.
- exam_ref / year: the exam named next to the question (e.g. "৪৫তম বিসিএস", "সোনালী ব্যাংক অফিসার"), else "" and 0.
Skip anything that is not a 4-option MCQ, and questions cut off at the page edge. If there are none, set page_kind "other" and return an empty list.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['page_kind', 'questions'],
  properties: {
    page_kind: { type: 'string', enum: ['mcq', 'other'] },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['body', 'a', 'b', 'c', 'd', 'book_answer', 'correct_answer', 'confident', 'note', 'subject', 'topic_bn', 'exam_ref', 'year'],
        properties: {
          body: { type: 'string' }, a: { type: 'string' }, b: { type: 'string' }, c: { type: 'string' }, d: { type: 'string' },
          book_answer: { type: 'string', enum: ['a', 'b', 'c', 'd', 'none'] },
          correct_answer: { type: 'string', enum: ['a', 'b', 'c', 'd'] },
          confident: { type: 'boolean' },
          note: { type: 'string' },
          subject: { type: 'string', enum: SUBJECTS },
          topic_bn: { type: 'string' },
          exam_ref: { type: 'string' },
          year: { type: 'integer' },
        },
      },
    },
  },
};

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.toLowerCase().endsWith('.pdf') ? [path.join(dir, e.name)] : []);

const sha1 = (file) => new Promise((resolve, reject) => {
  const h = crypto.createHash('sha1');
  fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
});

const loadPdf = async (file) => PDFDocument.load(fs.readFileSync(file), { ignoreEncryption: true, updateMetadata: false });

async function scan() {
  const files = walk(PDF_DIR);
  let added = 0, dup = 0, failed = 0;
  for (const file of files) {
    const rel = path.relative(PDF_DIR, file);
    const hash = await sha1(file);
    const existing = await one('SELECT id, path FROM ingest_files WHERE sha1=?', [hash]);
    if (existing) { if (existing.path !== rel) dup++; continue; }
    try {
      const pages = (await loadPdf(file)).getPageCount();
      const { insertId } = await query('INSERT INTO ingest_files (sha1, path, pages) VALUES (?,?,?)', [hash, rel, pages]);
      await query('INSERT INTO ingest_pages (file_id, page_no) VALUES ?', [Array.from({ length: pages }, (_, i) => [insertId, i + 1])]);
      added++;
      console.log(`+ ${rel} (${pages} pages)`);
    } catch (e) {
      failed++;
      console.warn(`! ${rel}: ${e.message}`);
    }
  }
  console.log(`✔ scan: ${added} new files, ${dup} duplicates skipped, ${failed} unreadable`);
}

async function submit(limit) {
  const pages = await query(
    `SELECT p.id, p.page_no, f.path FROM ingest_pages p JOIN ingest_files f ON f.id=p.file_id
     WHERE p.status='pending' ORDER BY p.file_id, p.page_no LIMIT ?`, [limit]);
  if (!pages.length) return console.log('Nothing pending.');

  const requests = [];
  let bytes = 0, doc = null, docPath = null;
  for (const p of pages) {
    if (docPath !== p.path) { doc = await loadPdf(path.join(PDF_DIR, p.path)); docPath = p.path; }
    const single = await PDFDocument.create();
    const [copied] = await single.copyPages(doc, [p.page_no - 1]);
    single.addPage(copied);
    const data = Buffer.from(await single.save());
    if (bytes + data.length > MAX_BATCH_BYTES) break;
    bytes += data.length;
    requests.push({
      custom_id: `page-${p.id}`,
      params: {
        model: MODEL,
        max_tokens: 16000,
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
        messages: [{ role: 'user', content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: data.toString('base64') } },
          { type: 'text', text: PROMPT },
        ] }],
      },
    });
  }

  const batch = await new Anthropic().messages.batches.create({ requests });
  const ids = requests.map((r) => Number(r.custom_id.slice(5)));
  await query("UPDATE ingest_pages SET status='submitted', batch_id=?, attempts=attempts+1 WHERE id IN (?)", [batch.id, ids]);
  console.log(`✔ submitted ${ids.length} pages (${(bytes / 1048576).toFixed(1)} MB) as batch ${batch.id}`);
}

async function collect() {
  const client = new Anthropic();
  const batches = await query("SELECT DISTINCT batch_id FROM ingest_pages WHERE status='submitted'");
  for (const { batch_id } of batches) {
    const batch = await client.messages.batches.retrieve(batch_id);
    if (batch.processing_status !== 'ended') {
      console.log(`… ${batch_id}: ${batch.processing_status} (${batch.request_counts.processing} processing)`);
      continue;
    }
    let done = 0, failed = 0;
    for await (const r of await client.messages.batches.results(batch_id)) {
      const id = Number(r.custom_id.slice(5));
      let result = null, error = null;
      if (r.result.type !== 'succeeded') error = `${r.result.type}${r.result.error ? `: ${r.result.error.type}` : ''}`;
      else if (r.result.message.stop_reason !== 'end_turn') error = `stop_reason ${r.result.message.stop_reason}`;
      else {
        try { result = JSON.parse(r.result.message.content.find((b) => b.type === 'text').text); }
        catch (e) { error = `bad JSON: ${e.message}`; }
      }
      if (result) { done++; await query("UPDATE ingest_pages SET status='done', result=?, error=NULL WHERE id=?", [JSON.stringify(result), id]); }
      else {
        // Transient failures go back to pending for the next submit; a page that failed 3 times is left for a person to check.
        failed++;
        await query("UPDATE ingest_pages SET status=IF(attempts>=3,'failed','pending'), error=? WHERE id=?", [error.slice(0, 500), id]);
      }
    }
    console.log(`✔ ${batch_id}: ${done} pages extracted, ${failed} failed`);
  }
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();

async function load() {
  const subjects = Object.fromEntries((await query('SELECT id, slug FROM subjects')).map((s) => [s.slug, s.id]));
  const topics = new Map((await query('SELECT id, subject_id, name_bn FROM topics')).map((t) => [`${t.subject_id}|${t.name_bn}`, t.id]));
  const seen = new Set((await query('SELECT subject_id, body FROM questions')).map((q) => `${q.subject_id}|${norm(q.body)}`));
  const pages = await query(
    `SELECT p.id, p.page_no, p.result, f.path FROM ingest_pages p JOIN ingest_files f ON f.id=p.file_id WHERE p.status='done'`);

  let added = 0, review = 0, skipped = 0;
  for (const p of pages) {
    const { questions } = typeof p.result === 'string' ? JSON.parse(p.result) : p.result;
    const source = `${path.basename(p.path, '.pdf')}, পৃ. ${p.page_no}`.slice(0, 160);
    for (const q of questions) {
      const subjectId = subjects[q.subject];
      const key = `${subjectId}|${norm(q.body)}`;
      if (!subjectId || seen.has(key)) { skipped++; continue; }
      seen.add(key);
      const topicKey = `${subjectId}|${q.topic_bn.slice(0, 120)}`;
      if (!topics.has(topicKey)) {
        topics.set(topicKey, (await query('INSERT INTO topics (subject_id, name_bn) VALUES (?,?)', [subjectId, q.topic_bn.slice(0, 120)])).insertId);
      }
      const disagrees = q.book_answer !== 'none' && q.book_answer !== q.correct_answer;
      const reviewNote = !q.confident || disagrees ? (q.note || 'উত্তর যাচাই দরকার') : null;
      const ins = await query('INSERT INTO questions SET ?', [{
        subject_id: subjectId, topic_id: topics.get(topicKey), body: q.body,
        option_a: q.a.slice(0, 500), option_b: q.b.slice(0, 500), option_c: q.c.slice(0, 500), option_d: q.d.slice(0, 500),
        correct_option: q.correct_answer, difficulty: 2, source, exam_ref: q.exam_ref.slice(0, 120) || null, year: q.year || null,
        status: reviewNote ? 'needs_review' : 'active', last_verified_at: reviewNote ? null : dhakaToday(),
      }]);
      await query('INSERT INTO question_versions (question_id, version, snapshot, change_note) VALUES (?,1,?,?)', [ins.insertId,
        JSON.stringify({ body: q.body, a: q.a, b: q.b, c: q.c, d: q.d, correct: q.correct_answer }),
        reviewNote ? `ইমপোর্ট — পর্যালোচনা দরকার: ${reviewNote}` : 'PDF থেকে ইমপোর্ট']);
      added++; if (reviewNote) review++;
    }
    await query("UPDATE ingest_pages SET status='loaded' WHERE id=?", [p.id]);
  }
  console.log(`✔ load: ${added} questions added (${review} need review), ${skipped} duplicates skipped, from ${pages.length} pages`);
}

async function status() {
  const files = await one('SELECT COUNT(*) n, COALESCE(SUM(pages),0) pages FROM ingest_files');
  const rows = await query('SELECT status, COUNT(*) n FROM ingest_pages GROUP BY status');
  console.log(`${files.n} files, ${files.pages} pages`);
  for (const r of rows) console.log(`  ${r.status.padEnd(10)} ${r.n}`);
}

const [cmd, ...args] = process.argv.slice(2);
const limitArg = args.indexOf('--limit');
const commands = { scan, submit: () => submit(limitArg >= 0 ? Number(args[limitArg + 1]) : 2000), collect, load, status };
if (!commands[cmd]) {
  console.error('Usage: npm run ingest -- <scan|submit|collect|load|status> [--limit N]');
  process.exitCode = 1;
} else {
  migrate().then(commands[cmd])
    .catch((e) => { console.error(e.message); process.exitCode = 1; })
    .finally(() => pool.end());
}
