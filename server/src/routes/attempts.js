import { Router } from 'express';
import { query, one } from '../db.js';
import { auth } from '../middleware/auth.js';
import { asyncH, HttpError } from '../services/util.js';
import { submitAttempt, buildReport } from '../services/attempts.js';
import { MISTAKE_TYPES } from '../services/mistakes.js';
import { getAccess, redactReport } from '../services/billing.js';

const r = Router();
r.use(auth);

async function ownAttempt(req) {
  const attempt = await one('SELECT * FROM attempts WHERE id=?', [req.params.id]);
  if (!attempt || attempt.user_id !== req.user.id) throw new HttpError(404, 'পরীক্ষা পাওয়া যায়নি');
  const test = await one('SELECT * FROM tests WHERE id=?', [attempt.test_id]);
  return { attempt, test };
}

r.get('/', asyncH(async (req, res) => {
  res.json(await query(
    `SELECT a.id, a.test_id, t.title, t.kind, a.total, a.correct, a.wrong, a.skipped, a.score, a.time_spent_sec, a.submitted_at
       FROM attempts a JOIN tests t ON t.id=a.test_id
      WHERE a.user_id=? AND a.status='submitted' ORDER BY a.submitted_at DESC LIMIT 100`, [req.user.id]));
}));

// Instant feedback for practice/revision mode only.
r.post('/:id/check', asyncH(async (req, res) => {
  const { attempt, test } = await ownAttempt(req);
  if (!test.instant_feedback || attempt.status !== 'in_progress') throw new HttpError(400, 'এই মোডে তাৎক্ষণিক উত্তর দেখা যাবে না');
  const q = await one(
    `SELECT q.correct_option, q.explanation, q.source FROM questions q JOIN test_questions tq ON tq.question_id=q.id AND tq.test_id=? WHERE q.id=?`,
    [test.id, req.body.question_id]);
  if (!q) throw new HttpError(404, 'প্রশ্ন পাওয়া যায়নি');
  res.json({ correct: q.correct_option, is_correct: q.correct_option === req.body.selected, explanation: q.explanation, source: q.source });
}));

r.post('/:id/submit', asyncH(async (req, res) => {
  const { attempt, test } = await ownAttempt(req);
  await submitAttempt(attempt, test, req.body.answers || []);
  res.json({ attempt_id: attempt.id });
}));

r.get('/:id/report', asyncH(async (req, res) => res.json(redactReport(await buildReport(Number(req.params.id), req.user), await getAccess(req.user)))));

// Student corrects the auto-detected mistake reason — their label wins.
r.put('/:id/answers/:qid/mistake', asyncH(async (req, res) => {
  const { attempt } = await ownAttempt(req);
  const type = req.body.type;
  if (type && !MISTAKE_TYPES[type]) throw new HttpError(400, 'অবৈধ ভুলের ধরন');
  await query('UPDATE attempt_answers SET mistake_type_user=? WHERE attempt_id=? AND question_id=? AND is_correct=0',
    [type || null, attempt.id, req.params.qid]);
  if (type) await query('UPDATE review_items SET last_mistake_type=? WHERE user_id=? AND question_id=?', [type, req.user.id, req.params.qid]);
  res.json({ ok: true });
}));

export default r;
