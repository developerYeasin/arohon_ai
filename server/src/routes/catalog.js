import { Router } from 'express';
import { query, one } from '../db.js';
import { asyncH, HttpError } from '../services/util.js';
import { examSubjects } from '../services/engine.js';

const r = Router();

r.get('/exams', asyncH(async (req, res) => {
  const where = req.query.track ? 'WHERE track=?' : '';
  res.json(await query(`SELECT * FROM exams ${where} ORDER BY track, sort_order`, req.query.track ? [req.query.track] : []));
}));

r.get('/exams/:id', asyncH(async (req, res) => {
  const exam = await one('SELECT * FROM exams WHERE id=?', [req.params.id]);
  if (!exam) throw new HttpError(404, 'পরীক্ষা পাওয়া যায়নি');
  res.json({ ...exam, subjects: await examSubjects(exam.id) });
}));

r.get('/subjects', asyncH(async (req, res) => {
  const params = []; let where = '';
  if (req.query.exam_id) { where = 'JOIN exam_subjects es ON es.subject_id=s.id AND es.exam_id=?'; params.push(req.query.exam_id); }
  else if (req.query.track) { where = 'WHERE s.track=?'; params.push(req.query.track); }
  res.json(await query(
    `SELECT s.*, (SELECT COUNT(*) FROM questions q WHERE q.subject_id=s.id AND q.status='active') question_count,
            (SELECT COUNT(*) FROM topics t WHERE t.subject_id=s.id) topic_count
       FROM subjects s ${where} ORDER BY s.id`, params));
}));

r.get('/subjects/:id/topics', asyncH(async (req, res) => {
  res.json(await query(
    `SELECT t.*, COUNT(q.id) question_count, SUM(q.year IS NOT NULL) pyq_count
       FROM topics t LEFT JOIN questions q ON q.topic_id=t.id AND q.status='active'
      WHERE t.subject_id=? GROUP BY t.id ORDER BY t.id`, [req.params.id]));
}));

// Previous-year question intelligence for an exam: what is actually examined, and how often.
r.get('/exams/:id/intelligence', asyncH(async (req, res) => {
  const subjects = await examSubjects(req.params.id);
  if (!subjects.length) return res.json({ subjects: [], topics: [], years: [] });
  const ids = subjects.map((s) => s.id);
  const topics = await query(
    `SELECT t.id, t.name_bn, s.name_bn subject, COUNT(q.id) times, COUNT(DISTINCT q.year) distinct_years,
            MIN(q.year) first_year, MAX(q.year) last_year, ROUND(AVG(q.difficulty),1) avg_difficulty,
            GROUP_CONCAT(DISTINCT q.exam_ref ORDER BY q.year DESC SEPARATOR ', ') exams
       FROM questions q JOIN topics t ON t.id=q.topic_id JOIN subjects s ON s.id=q.subject_id
      WHERE q.year IS NOT NULL AND q.status='active' AND q.subject_id IN (?)
      GROUP BY t.id, s.id ORDER BY times DESC, last_year DESC`, [ids]);
  const years = await query(
    `SELECT q.year, s.name_bn subject, COUNT(*) n FROM questions q JOIN subjects s ON s.id=q.subject_id
      WHERE q.year IS NOT NULL AND q.status='active' AND q.subject_id IN (?) GROUP BY q.year, s.id ORDER BY q.year`, [ids]);
  const maxYear = Math.max(...topics.map((t) => t.last_year || 0));
  res.json({
    subjects,
    topics: topics.map((t) => ({
      ...t,
      label: t.times >= 3 ? 'frequent' : t.last_year >= maxYear - 1 && t.first_year >= maxYear - 2 ? 'emerging' : t.times === 1 ? 'rare' : 'recurring',
    })),
    years,
  });
}));

r.get('/stats', asyncH(async (_req, res) => {
  const s = await one(`SELECT (SELECT COUNT(*) FROM questions WHERE status='active') questions,
                              (SELECT COUNT(*) FROM users) users,
                              (SELECT COUNT(*) FROM attempts WHERE status='submitted') attempts,
                              (SELECT COUNT(*) FROM exams) exams`);
  res.json(s);
}));

export default r;
