// Adds explanations (and optional corrections) to already-imported questions, recording each change
// as a new version.  node src/seed/apply-explanations.js src/seed/imports/<file>-explanations.js
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pool, query, one } from '../db.js';
import { dhakaToday } from '../services/util.js';

async function main() {
  const { topic, updates } = await import(pathToFileURL(path.resolve(process.argv[2])).href);
  const t = await one('SELECT id FROM topics WHERE name_bn=?', [topic]);
  if (!t) throw new Error(`Topic "${topic}" not found — import the questions first`);
  let done = 0, fixed = 0, missing = [];
  for (const [body, explanation, fix] of updates) {
    const q = await one('SELECT * FROM questions WHERE topic_id=? AND body=?', [t.id, body]);
    if (!q) { missing.push(body); continue; }
    const { note, ...fields } = fix || {};
    const patch = { explanation, ...fields, version: q.version + 1, last_verified_at: dhakaToday(), ...(fix ? { status: 'active' } : {}) };
    await query('UPDATE questions SET ? WHERE id=?', [patch, q.id]);
    const snap = await one('SELECT body, option_a, option_b, option_c, option_d, correct_option, explanation, status FROM questions WHERE id=?', [q.id]);
    await query('INSERT INTO question_versions (question_id, version, snapshot, change_note) VALUES (?,?,?,?)',
      [q.id, patch.version, JSON.stringify(snap), note || 'ব্যাখ্যা যোগ']);
    done++; if (fix) fixed++;
  }
  console.log(`✔ explanations: ${done}, corrected & activated: ${fixed}${missing.length ? `, not found: ${missing.length}\n  ${missing.join('\n  ')}` : ''}`);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => pool.end());
