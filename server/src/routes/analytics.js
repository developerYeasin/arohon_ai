import { Router } from 'express';
import { query, one } from '../db.js';
import { auth } from '../middleware/auth.js';
import { asyncH, dhakaToday, addDays, daysBetween, pct } from '../services/util.js';
import { readiness, getMission, getUserExam } from '../services/engine.js';
import { MISTAKE_TYPES, effectiveType } from '../services/mistakes.js';
import { getAccess, redactReadiness } from '../services/billing.js';
import { buildPlanner, weekProgress, setWeeklyGoal } from '../services/planner.js';
import { listBadges } from '../services/badges.js';

const r = Router();
r.use(auth);

r.get('/readiness', asyncH(async (req, res) => res.json(redactReadiness(await readiness(req.user), await getAccess(req.user)))));
r.get('/mission', asyncH(async (req, res) => res.json(await getMission(req.user))));

r.get('/dashboard', asyncH(async (req, res) => {
  const [full, mission, exam, access] = await Promise.all([readiness(req.user), getMission(req.user), getUserExam(req.user), getAccess(req.user)]);
  const ready = redactReadiness(full, access);
  const today = dhakaToday();
  const due = await one('SELECT COUNT(*) n FROM review_items WHERE user_id=? AND mastered=0 AND due_date<=?', [req.user.id, today]);
  const live = await query(
    `SELECT id, title, starts_at, ends_at, duration_sec FROM tests
      WHERE kind='live' AND ends_at > UTC_TIMESTAMP() AND (track IS NULL OR track=?) ORDER BY starts_at LIMIT 3`, [req.user.track]);
  const week = await one(
    `SELECT COALESCE(SUM(xp_earned),0) xp, COUNT(*) tests, COALESCE(SUM(total),0) questions
       FROM attempts WHERE user_id=? AND status='submitted' AND submitted_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY`, [req.user.id]);
  const u = await one('SELECT xp, streak, best_streak, last_active_date FROM users WHERE id=?', [req.user.id]);
  const streakAlive = u.last_active_date === today || u.last_active_date === addDays(today, -1);
  res.json({
    readiness: ready, mission, due_reviews: due.n, live, week, access, week_goal: await weekProgress(req.user),
    new_badges: (await listBadges(req.user.id)).filter((b) => b.unseen),
    user: { xp: u.xp, level: Math.floor(Math.sqrt(u.xp / 50)) + 1, streak: streakAlive ? u.streak : 0, best_streak: u.best_streak, studied_today: u.last_active_date === today },
    days_left: (req.user.exam_date || exam?.next_exam_date) ? daysBetween(today, req.user.exam_date || exam.next_exam_date) : null,
  });
}));

// Daily accuracy & volume for the last N days — "am I actually improving?"
r.get('/progress', asyncH(async (req, res) => {
  const days = Math.min(Number(req.query.days) || 30, 120);
  const rows = await query(
    `SELECT DATE(CONVERT_TZ(aa.created_at, '+00:00', '+06:00')) d, COUNT(*) n, SUM(aa.selected_option IS NOT NULL) answered,
            SUM(aa.is_correct) correct, ROUND(AVG(CASE WHEN aa.selected_option IS NOT NULL THEN aa.time_ms END)/1000,1) avg_sec
       FROM attempt_answers aa WHERE aa.user_id=? AND aa.created_at >= UTC_TIMESTAMP() - INTERVAL ? DAY
      GROUP BY d ORDER BY d`, [req.user.id, days]);
  const tests = await query(
    `SELECT a.id, t.title, t.kind, a.score, a.total, a.submitted_at FROM attempts a JOIN tests t ON t.id=a.test_id
      WHERE a.user_id=? AND a.status='submitted' AND a.total>=10 ORDER BY a.submitted_at DESC LIMIT 15`, [req.user.id]);
  res.json({
    daily: rows.map((x) => ({ date: x.d, questions: Number(x.n), accuracy: pct(Number(x.correct), Number(x.answered)), avg_sec: Number(x.avg_sec) })),
    tests: tests.reverse().map((t) => ({ ...t, pct: Math.round((100 * Number(t.score)) / t.total) })),
  });
}));

// Mistake Intelligence dashboard.
r.get('/mistakes', asyncH(async (req, res) => {
  const rows = await query(
    `SELECT aa.question_id, aa.mistake_type, aa.mistake_type_user, aa.created_at, q.body, q.topic_id, t.name_bn topic, s.name_bn subject
       FROM attempt_answers aa JOIN questions q ON q.id=aa.question_id JOIN topics t ON t.id=q.topic_id JOIN subjects s ON s.id=q.subject_id
      WHERE aa.user_id=? AND aa.is_correct=0 AND aa.selected_option IS NOT NULL ORDER BY aa.id DESC LIMIT 1000`, [req.user.id]);
  const byType = {}; const byTopic = new Map(); const byQ = new Map();
  for (const m of rows) {
    const t = effectiveType(m) || 'didnt_know';
    byType[t] = (byType[t] || 0) + 1;
    const tp = byTopic.get(m.topic_id) || { topic_id: m.topic_id, topic: m.topic, subject: m.subject, count: 0, types: {} };
    tp.count++; tp.types[t] = (tp.types[t] || 0) + 1; byTopic.set(m.topic_id, tp);
    const q = byQ.get(m.question_id) || { question_id: m.question_id, body: m.body, topic: m.topic, count: 0, type: t };
    q.count++; byQ.set(m.question_id, q);
  }
  const review = await one(
    `SELECT SUM(mastered=0) open_items, SUM(mastered=1) mastered, SUM(mastered=0 AND due_date<=?) due_today,
            SUM(mastered=0 AND due_date=?) due_tomorrow, SUM(mastered=0 AND due_date>? AND due_date<=?) due_week
       FROM review_items WHERE user_id=?`, [dhakaToday(), addDays(dhakaToday(), 1), addDays(dhakaToday(), 1), addDays(dhakaToday(), 7), req.user.id]);
  const access = await getAccess(req.user);
  res.json({
    pro: access.pro,
    total: rows.length,
    by_type: Object.entries(byType).map(([k, v]) => ({ type: k, label: MISTAKE_TYPES[k]?.bn, remedy: MISTAKE_TYPES[k]?.remedy, action: MISTAKE_TYPES[k]?.action, count: v })).sort((a, b) => b.count - a.count),
    by_topic: !access.pro ? [] : [...byTopic.values()].sort((a, b) => b.count - a.count).slice(0, 15)
      .map((t) => ({ ...t, main_type: Object.entries(t.types).sort((a, b) => b[1] - a[1])[0][0], main_label: MISTAKE_TYPES[Object.entries(t.types).sort((a, b) => b[1] - a[1])[0][0]]?.bn })),
    repeated: !access.pro ? [] : [...byQ.values()].filter((q) => q.count >= 2).sort((a, b) => b.count - a.count).slice(0, 20),
    review: Object.fromEntries(Object.entries(review || {}).map(([k, v]) => [k, Number(v || 0)])),
    types: MISTAKE_TYPES,
  });
}));

r.get('/planner', asyncH(async (req, res) => {
  const [plan, access] = await Promise.all([buildPlanner(req.user), getAccess(req.user)]);
  if (plan && !access.pro) { plan.phases_locked = plan.phases.length; plan.phases = []; }
  res.json(plan);
}));

r.put('/weekly-goal', asyncH(async (req, res) => {
  const goal = Number(req.body.goal) || null;
  if (goal != null && (goal < 20 || goal > 5000)) return res.status(400).json({ error: 'লক্ষ্য ২০ থেকে ৫০০০ প্রশ্নের মধ্যে দিন' });
  await setWeeklyGoal(req.user.id, goal);
  res.json(await weekProgress({ ...req.user, weekly_goal: goal }));
}));

r.get('/badges', asyncH(async (req, res) => res.json(await listBadges(req.user.id))));
r.post('/badges/seen', asyncH(async (req, res) => {
  await query('UPDATE user_badges SET seen=1 WHERE user_id=?', [req.user.id]);
  res.json({ ok: true });
}));

export default r;
