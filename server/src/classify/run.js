// Rule-based per-question classifier.  node src/classify/run.js [--dry]
// Only classification fields are written (subject_id, topic_id, subtopic_id, q_type, cls_*); the original
// topic stays in questions.source_topic_id and every change is logged in classification_audit.
import { pool } from '../db.js';
import { rules, familySubject, moveFrom, CATCH_ALL, APPLY_MIN } from './rules.js';

const DRY = process.argv.includes('--dry');
const BATCH = 5000;

const BN_DIGIT = /[0-9০-৯]/;
const isNumeric = (opts) => opts.filter((o) => BN_DIGIT.test(o)).length >= 3;
const isLatin = (s) => { const l = (s.match(/[A-Za-z]/g) || []).length, b = (s.match(/[ঀ-৿]/g) || []).length; return l > b; };
// Bengali-worded vocabulary questions whose options are English test English vocabulary.
const toEnglish = { Synonyms: 'Synonyms', Antonyms: 'Antonyms', 'Correct Spelling': 'Spelling', 'One-Word Expression': 'One-Word Substitution' };
const qType = (r) => (r.family === 'math' ? 'calculation' : r.topic === 'Vocabulary' || r.sub in toEnglish ? 'vocabulary'
  : r.topic === 'Grammar' || r.topic === 'ব্যাকরণ' ? 'grammar' : 'factual_recall');

function classify(q) {
  const opts = [q.option_a, q.option_b, q.option_c, q.option_d];
  const hits = [];
  for (const r of rules) {
    if (!r.re.test(q.body)) continue;
    if (r.needsNumber && !isNumeric(opts)) continue;
    if (r.noNumber && isNumeric(opts)) continue;
    if (r.needsLatin && q.language === 'bn') continue;
    if (r.family === 'bangla' && r.sub in toEnglish && opts.filter(isLatin).length >= 3) {
      const en = rules.find((x) => x.family === 'english' && x.sub === toEnglish[r.sub]);
      hits.push({ ...en, conf: r.conf - 2 });
    } else hits.push(r);
  }
  if (!hits.length) return null;
  hits.sort((a, b) => b.conf - a.conf);
  const best = hits[0];
  const rival = hits.find((h) => h.family !== best.family && h.conf >= best.conf - 5);
  if (rival) return { ambiguous: true, best, rival };
  const sameFamilyRival = hits.find((h) => h !== best && h.family === best.family && h.sub !== best.sub && h.conf === best.conf);
  return { best: sameFamilyRival ? { ...best, conf: best.conf - 10 } : best, multi: sameFamilyRival };
}

const topicCache = new Map(), subCache = new Map();
async function conceptTopic(subjectId, r) {
  const k = `${subjectId}|${r.topic}`;
  if (topicCache.has(k)) return topicCache.get(k);
  let [[t]] = await pool.query("SELECT id FROM topics WHERE subject_id=? AND name_en=? AND kind='concept'", [subjectId, r.topic]);
  if (!t) {
    if (DRY) { topicCache.set(k, -1); return -1; }
    const [ins] = await pool.query("INSERT INTO topics (subject_id,name_bn,name_en,kind) VALUES (?,?,?,'concept')", [subjectId, r.topicBn, r.topic]);
    t = { id: ins.insertId };
  }
  topicCache.set(k, t.id); return t.id;
}
async function subtopic(topicId, r) {
  const k = `${topicId}|${r.sub}`;
  if (subCache.has(k)) return subCache.get(k);
  if (DRY) { subCache.set(k, -1); return -1; }
  await pool.query('INSERT IGNORE INTO subtopics (topic_id,name_bn,name_en) VALUES (?,?,?)', [topicId, r.subBn, r.sub]);
  const [[s]] = await pool.query('SELECT id FROM subtopics WHERE topic_id=? AND name_en=?', [topicId, r.sub]);
  subCache.set(k, s.id); return s.id;
}

async function main() {
  const [subs] = await pool.query('SELECT id, track FROM subjects');
  const track = Object.fromEntries(subs.map((s) => [s.id, s.track]));
  const stats = { scanned: 0, applied: 0, moved: 0, ambiguous: 0, low: 0, outOfSubject: 0, noRule: 0 };
  const byTarget = {}, samples = [];
  let last = 0;
  for (;;) {
    const [rows] = await pool.query(
      `SELECT id, subject_id, topic_id, body, option_a, option_b, option_c, option_d, language FROM questions
       WHERE id>? AND cls_status='unclassified' ORDER BY id LIMIT ?`, [last, BATCH]);
    if (!rows.length) break;
    const audits = [], updates = new Map(), flagged = { ambiguous: [], needs_review: [] };
    for (const q of rows) {
      last = q.id; stats.scanned++;
      const res = classify(q);
      if (!res) { stats.noRule++; continue; }
      if (res.ambiguous) {
        stats.ambiguous++; flagged.ambiguous.push(q.id);
        audits.push([q.id, q.subject_id, q.topic_id, null, null, null, res.best.conf, 'ambiguous',
          `rules disagree: ${res.best.family}/${res.best.sub} vs ${res.rival.family}/${res.rival.sub}`, 'rule']);
        continue;
      }
      const r = res.best, tr = track[q.subject_id];
      let target = null;
      if (familySubject[tr]?.[r.family] === q.subject_id) target = q.subject_id;
      else if (tr === 'job' && (r.catchAllOnly ? CATCH_ALL : moveFrom[r.family]).has(q.subject_id)) target = familySubject.job[r.family];
      if (!target) { stats.outOfSubject++; continue; } // e.g. an English rule hit inside academic Physics: leave as is
      if (r.conf < APPLY_MIN) {
        stats.low++; flagged.needs_review.push(q.id);
        audits.push([q.id, q.subject_id, q.topic_id, target, null, null, r.conf, 'needs_review', `suggest ${r.family}/${r.topic}/${r.sub}`, 'rule']);
        continue;
      }
      const topicId = await conceptTopic(target, r), subId = await subtopic(topicId, r);
      const key = [target, topicId, subId, r.conf, qType(r)].join('|');
      if (!updates.has(key)) updates.set(key, []);
      updates.get(key).push(q.id);
      stats.applied++; if (target !== q.subject_id) stats.moved++;
      const label = `${target}:${r.topic}/${r.sub}`; byTarget[label] = (byTarget[label] || 0) + 1;
      if (target !== q.subject_id && samples.length < 50 && Math.random() < 0.02) samples.push({ id: q.id, from: q.subject_id, to: target, cls: `${r.topic}/${r.sub}`, conf: r.conf, body: q.body.slice(0, 90) });
      audits.push([q.id, q.subject_id, q.topic_id, target, topicId, subId, r.conf, 'auto', `rule: ${r.re.source.slice(0, 200)}`, 'rule']);
    }
    if (!DRY) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        for (const [key, ids] of updates) {
          const [s, t, st, c, ty] = key.split('|');
          await conn.query("UPDATE questions SET subject_id=?, topic_id=?, subtopic_id=?, cls_confidence=?, q_type=?, cls_status='auto' WHERE id IN (?)", [s, t, st, c, ty, ids]);
        }
        for (const [st, ids] of Object.entries(flagged)) if (ids.length) await conn.query('UPDATE questions SET cls_status=? WHERE id IN (?)', [st, ids]);
        if (audits.length) await conn.query('INSERT INTO classification_audit (question_id,old_subject_id,old_topic_id,new_subject_id,new_topic_id,new_subtopic_id,confidence,cls_status,reason,method) VALUES ?', [audits]);
        await conn.commit();
      } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    }
    process.stdout.write(`\r${stats.scanned} scanned, ${stats.applied} applied`);
  }
  console.log('\n', DRY ? '(dry run — nothing written)' : '', stats);
  console.table(Object.entries(byTarget).sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k, n]) => ({ k, n })));
  console.table(samples);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
