// Adds a question file to the bank without touching anything else. Safe to re-run: questions
// whose text already exists in the same topic are skipped.
//   node src/seed/import-questions.js src/seed/imports/<file>.js
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pool, query, one } from '../db.js';
import { dhakaToday } from '../services/util.js';

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: node src/seed/import-questions.js <file>');
  const { meta, rows } = await import(pathToFileURL(path.resolve(file)).href);
  const subject = await one('SELECT id FROM subjects WHERE slug=?', [meta.subjectSlug]);
  if (!subject) throw new Error(`Subject ${meta.subjectSlug} not found`);
  let topic = await one('SELECT id FROM topics WHERE subject_id=? AND name_bn=?', [subject.id, meta.topic]);
  if (!topic) topic = { id: (await query('INSERT INTO topics (subject_id, name_bn) VALUES (?,?)', [subject.id, meta.topic])).insertId };

  let added = 0, skipped = 0, review = 0;
  for (const [body, a, b, c, d, correct, reviewNote] of rows) {
    if (await one('SELECT id FROM questions WHERE topic_id=? AND body=?', [topic.id, body])) { skipped++; continue; }
    const status = reviewNote ? 'needs_review' : 'active';
    const ins = await query('INSERT INTO questions SET ?', [{
      subject_id: subject.id, topic_id: topic.id, body, option_a: a, option_b: b, option_c: c, option_d: d, correct_option: correct,
      difficulty: 2, source: meta.source, status, last_verified_at: reviewNote ? null : dhakaToday() }]);
    await query('INSERT INTO question_versions (question_id, version, snapshot, change_note) VALUES (?,1,?,?)',
      [ins.insertId, JSON.stringify({ body, a, b, c, d, correct }), reviewNote ? `ইমপোর্ট — পর্যালোচনা দরকার: ${reviewNote}` : 'PDF থেকে ইমপোর্ট']);
    added++; if (reviewNote) review++;
  }
  console.log(`✔ ${meta.topic}: added ${added} (${review} need review), skipped ${skipped} duplicates`);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => pool.end());
