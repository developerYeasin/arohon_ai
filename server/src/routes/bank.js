// Question bank for students: search across all active MCQs, past exam papers, quizzes built from
// either, and question sets downloaded for offline practice.
import { Router } from 'express';
import { query, one } from '../db.js';
import { auth } from '../middleware/auth.js';
import { asyncH, HttpError, clamp } from '../services/util.js';
import { createTest, getUserExam } from '../services/engine.js';

const r = Router();
r.use(auth);

const Q_COLS = `q.id, q.body, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option, q.explanation,
  q.exam_ref, q.year, s.name_bn subject, t.name_bn topic`;
const Q_FROM = 'FROM questions q JOIN subjects s ON s.id=q.subject_id LEFT JOIN topics t ON t.id=q.topic_id';
const MIN_PAPER = 30; // an exam_ref with fewer questions is a fragment, not a paper

const examDefaults = async (user) => {
  const exam = await getUserExam(user);
  return { exam, neg: exam ? Number(exam.negative_mark) : 0, sec: exam?.sec_per_question || 40 };
};
const words = (q) => [...new Set(q.split(/[\s,;:।?!()"'“”‘’\-–—/]+/).map((w) => w.trim()).filter((w) => w.length >= 2))].slice(0, 6);

// Search: exact phrase first; if nothing matches, fall back to any of the words, ranked by how many match
// (so a misspelt or extra word still finds the question).
r.get('/search', asyncH(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 120);
  if (q.length < 2) throw new HttpError(400, 'অন্তত ২ অক্ষর লিখুন');
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 20;
  const filters = ["q.status='active'"]; const fv = [];
  if (req.query.subject_id) { filters.push('q.subject_id=?'); fv.push(Number(req.query.subject_id)); }
  if (req.query.year) { filters.push('q.year=?'); fv.push(Number(req.query.year)); }
  if (req.query.pyq === '1') filters.push('q.exam_ref IS NOT NULL');

  let rows = await query(
    `SELECT ${Q_COLS} ${Q_FROM} WHERE ${filters.join(' AND ')} AND q.body LIKE ? ORDER BY q.year DESC, q.id DESC LIMIT ? OFFSET ?`,
    [...fv, `%${q}%`, limit + 1, (page - 1) * limit]);
  let mode = 'phrase';
  const ws = words(q);
  if (!rows.length && page === 1 && ws.length > 1) {
    mode = 'words';
    const score = ws.map(() => '(q.body LIKE ?)').join(' + ');
    rows = await query(
      `SELECT ${Q_COLS}, (${score}) hits ${Q_FROM} WHERE ${filters.join(' AND ')} AND (${ws.map(() => 'q.body LIKE ?').join(' OR ')})
        ORDER BY hits DESC, q.year DESC LIMIT ?`,
      [...ws.map((w) => `%${w}%`), ...fv, ...ws.map((w) => `%${w}%`), limit + 1]);
  }
  res.json({ mode, page, has_more: rows.length > limit, rows: rows.slice(0, limit) });
}));

// Past papers: an exam_ref with enough questions to be a real paper.
r.get('/papers', asyncH(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  const rows = await query(
    `SELECT exam_ref, MAX(year) year, COUNT(*) questions FROM questions
      WHERE status='active' AND exam_ref IS NOT NULL ${q ? 'AND exam_ref LIKE ?' : ''}
      GROUP BY exam_ref HAVING questions >= ? ORDER BY MAX(year) IS NULL, MAX(year) DESC, questions DESC LIMIT 80`,
    q ? [`%${q}%`, MIN_PAPER] : [MIN_PAPER]);
  res.json(rows);
}));

// Build a test from search results (instant feedback) or a whole past paper (timed, exam rules).
r.post('/test', asyncH(async (req, res) => {
  const { exam, neg, sec } = await examDefaults(req.user);
  if (req.body.examRef) {
    const ref = String(req.body.examRef);
    const ids = (await query(`SELECT id FROM questions WHERE status='active' AND exam_ref=? ORDER BY id LIMIT 250`, [ref])).map((x) => x.id);
    if (ids.length < MIN_PAPER) throw new HttpError(404, 'এই প্রশ্নপত্রে যথেষ্ট প্রশ্ন নেই');
    const timed = req.body.timed !== false;
    const id = await createTest({ title: `বিগত প্রশ্নপত্র: ${ref}`.slice(0, 250), kind: 'practice', track: req.user.track, examId: exam?.id,
      questionIds: ids, durationSec: timed ? ids.length * sec : 0, negativeMark: timed ? neg : 0, instantFeedback: !timed, userId: req.user.id });
    return res.json({ test_id: id });
  }
  const ids = [...new Set((req.body.questionIds || []).map(Number).filter(Boolean))].slice(0, 100);
  if (!ids.length) throw new HttpError(400, 'প্রশ্ন বেছে নিন');
  const ok = (await query(`SELECT id FROM questions WHERE status='active' AND id IN (?)`, [ids])).map((x) => x.id);
  if (!ok.length) throw new HttpError(404, 'প্রশ্ন পাওয়া যায়নি');
  const id = await createTest({ title: `প্রশ্নভান্ডার কুইজ: ${String(req.body.title || '').slice(0, 80) || 'নির্বাচিত প্রশ্ন'}`, kind: 'practice',
    track: req.user.track, examId: exam?.id, questionIds: ok, instantFeedback: true, userId: req.user.id });
  res.json({ test_id: id });
}));

// A set of questions with answers, stored on the device for practice without internet.
r.get('/offline-set', asyncH(async (req, res) => {
  const count = clamp(Number(req.query.count) || 50, 10, 100);
  const where = ["q.status='active'"]; const vals = [];
  if (req.query.subject_id) { where.push('q.subject_id=?'); vals.push(Number(req.query.subject_id)); }
  else if (req.query.exam_ref) { where.push('q.exam_ref=?'); vals.push(String(req.query.exam_ref)); }
  else throw new HttpError(400, 'বিষয় বা প্রশ্নপত্র বেছে নিন');
  const rows = await query(`SELECT ${Q_COLS} ${Q_FROM} WHERE ${where.join(' AND ')} ORDER BY RAND() LIMIT ?`, [...vals, count]);
  if (!rows.length) throw new HttpError(404, 'এই অংশে প্রশ্ন নেই');
  const title = req.query.subject_id
    ? (await one('SELECT name_bn FROM subjects WHERE id=?', [Number(req.query.subject_id)]))?.name_bn
    : String(req.query.exam_ref);
  res.json({ title, created_at: new Date().toISOString(), questions: rows });
}));

export default r;
