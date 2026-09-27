// Adds starter written prompts and viva questions without touching other data.
// Runs as part of `npm run seed`, or alone: `npm run seed:prep`.
import { pool, query, one } from '../db.js';
import { migrate } from '../migrate.js';
import { DEFAULT_RUBRIC } from '../services/written.js';
import { writtenPrompts, vivaQuestions } from './prep-data.js';

export async function seedPrep() {
  if ((await one('SELECT COUNT(*) n FROM written_prompts')).n === 0) {
    for (const p of writtenPrompts) {
      const exam = await one('SELECT id FROM exams WHERE code=?', [p.exam]);
      const subject = await one('SELECT id FROM subjects WHERE slug=?', [p.subject]);
      await query('INSERT INTO written_prompts SET ?', [{
        track: p.track, exam_id: exam?.id || null, subject_id: subject?.id || null, title: p.title, prompt: p.prompt, marks: p.marks,
        word_limit: p.word_limit, time_min: p.time_min, key_points: JSON.stringify(p.key_points), model_answer: p.model_answer,
        rubric: JSON.stringify(p.rubric || DEFAULT_RUBRIC), source: p.source }]);
    }
  }
  if ((await one('SELECT COUNT(*) n FROM viva_questions')).n === 0) {
    const bcs = await one(`SELECT id FROM exams WHERE code='bcs-preli'`);
    for (const q of vivaQuestions) {
      await query('INSERT INTO viva_questions SET ?', [{ track: 'job', exam_id: bcs?.id || null, category: q.category, question: q.question,
        guidance: q.guidance, key_points: JSON.stringify(q.key_points), follow_ups: JSON.stringify(q.follow_ups) }]);
    }
  }
  return { written: writtenPrompts.length, viva: vivaQuestions.length };
}

if (process.argv[1]?.endsWith('seed-prep.js')) {
  migrate().then(seedPrep)
    .then((n) => console.log(`✔ Written prompts: ${n.written}, viva questions: ${n.viva}`))
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => pool.end());
}
