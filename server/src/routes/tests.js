import { Router } from 'express';
import { query, one, tx } from '../db.js';
import { auth } from '../middleware/auth.js';
import { asyncH, HttpError, clamp, shuffle, dhakaToday, parseJson } from '../services/util.js';
import { createTest, pickAdaptive, pickMock, getUserExam, examSubjects, dueReviewIds, getMission, buildSession } from '../services/engine.js';
import { testQuestions, liveResultsHidden } from '../services/attempts.js';
import { checkQuota, requirePro, getAccess, upgradeError, FREE_LIMITS } from '../services/billing.js';

const r = Router();
r.use(auth);

const examDefaults = async (user) => {
  const exam = await getUserExam(user);
  return { exam, neg: exam ? Number(exam.negative_mark) : 0, sec: exam?.sec_per_question || 40 };
};

// Topic / subject practice. Untimed with instant feedback, or timed exam-style.
r.post('/practice', asyncH(async (req, res) => {
  const { topicIds = [], subjectId, count = 20, timed = false, pyqOnly = false } = req.body;
  const n = clamp(Number(count) || 20, 5, 100);
  const where = ["status='active'"]; const params = [];
  if (topicIds.length) { where.push('topic_id IN (?)'); params.push(topicIds); }
  else if (subjectId) { where.push('subject_id=?'); params.push(subjectId); }
  else throw new HttpError(400, 'বিষয় বা টপিক বেছে নিন');
  if (pyqOnly) where.push('year IS NOT NULL');
  const rows = await query(`SELECT id FROM questions WHERE ${where.join(' AND ')} ORDER BY RAND() LIMIT ?`, [...params, n]);
  if (!rows.length) throw new HttpError(404, 'এই অংশে এখনো প্রশ্ন নেই');
  const { exam, neg, sec } = await examDefaults(req.user);
  let title = 'অনুশীলন';
  if (topicIds.length === 1) title = `অনুশীলন: ${(await one('SELECT name_bn FROM topics WHERE id=?', [topicIds[0]]))?.name_bn}`;
  else if (subjectId) title = `অনুশীলন: ${(await one('SELECT name_bn FROM subjects WHERE id=?', [subjectId]))?.name_bn}`;
  if (pyqOnly) title += ' (বিগত বছরের প্রশ্ন)';
  const id = await createTest({ title, kind: 'practice', track: req.user.track, examId: exam?.id, questionIds: rows.map((x) => x.id),
    durationSec: timed ? rows.length * sec : 0, negativeMark: timed ? neg : 0, instantFeedback: !timed, userId: req.user.id });
  res.json({ test_id: id });
}));

r.post('/adaptive', asyncH(async (req, res) => {
  const { topicIds = [], subjectIds, count = 20, focus = 'balanced' } = req.body;
  await checkQuota(req.user, 'adaptive', FREE_LIMITS.adaptive_per_day, 'অ্যাডাপটিভ টেস্ট');
  const { exam, neg, sec } = await examDefaults(req.user);
  const sIds = subjectIds?.length ? subjectIds : exam ? (await examSubjects(exam.id)).map((s) => s.id) : [];
  const ids = await pickAdaptive(req.user.id, { subjectIds: sIds, topicIds, count: clamp(Number(count) || 20, 5, 100), focus });
  if (!ids.length) throw new HttpError(404, 'প্রশ্ন পাওয়া যায়নি');
  const id = await createTest({ title: focus === 'hard' ? 'কঠিন প্রশ্নের চ্যালেঞ্জ' : 'আপনার জন্য তৈরি অ্যাডাপটিভ টেস্ট', kind: 'adaptive',
    track: req.user.track, examId: exam?.id, questionIds: ids, durationSec: ids.length * sec, negativeMark: neg, userId: req.user.id });
  res.json({ test_id: id });
}));

// Full or mini exam-hall simulation with the real subject distribution.
r.post('/mock', asyncH(async (req, res) => {
  const exam = req.body.examId ? await one('SELECT * FROM exams WHERE id=?', [req.body.examId]) : await getUserExam(req.user);
  if (!exam) throw new HttpError(404, 'পরীক্ষা পাওয়া যায়নি');
  const total = clamp(Number(req.body.count) || exam.total_questions, 10, exam.total_questions);
  if (!(await getAccess(req.user)).pro && total > FREE_LIMITS.mock_max_questions) throw upgradeError('পূর্ণাঙ্গ মডেল টেস্ট এক্সাম পাসের ফিচার। ফ্রিতে দিনে একটি মিনি মডেল টেস্ট (২৫ প্রশ্ন) দিতে পারবেন।');
  await checkQuota(req.user, 'mock', FREE_LIMITS.mock_per_day, 'মডেল টেস্ট');
  const ids = await pickMock(req.user.id, exam, total);
  const full = ids.length === exam.total_questions;
  const id = await createTest({ title: `${exam.name_bn} — ${full ? 'পূর্ণাঙ্গ' : 'মিনি'} মডেল টেস্ট`, kind: 'mock', track: exam.track, examId: exam.id,
    questionIds: ids, durationSec: full ? exam.duration_min * 60 : ids.length * exam.sec_per_question, negativeMark: Number(exam.negative_mark), userId: req.user.id });
  res.json({ test_id: id });
}));

r.post('/revision', asyncH(async (req, res) => {
  const access = await checkQuota(req.user, 'revision', FREE_LIMITS.revision_per_day, 'রিভিশন সেশন');
  const ids = await dueReviewIds(req.user.id, access.pro ? clamp(Number(req.body.count) || 30, 5, 60) : FREE_LIMITS.revision_max_questions);
  if (!ids.length) throw new HttpError(404, 'আজ রিভিশনের কিছু নেই — দারুণ!');
  const id = await createTest({ title: 'আজকের স্মার্ট রিভিশন', kind: 'revision', track: req.user.track, questionIds: shuffle(ids), instantFeedback: true, userId: req.user.id });
  res.json({ test_id: id });
}));

// "Test me only on the topics I repeatedly get wrong."
r.post('/mistakes', asyncH(async (req, res) => {
  await requirePro(req.user, 'ভুলের ধরনভিত্তিক রি-টেস্ট');
  const params = [req.user.id]; let extra = '';
  if (req.body.type) { extra = 'AND last_mistake_type=?'; params.push(req.body.type); }
  if (req.body.topicId) { extra += ' AND question_id IN (SELECT id FROM questions WHERE topic_id=?)'; params.push(req.body.topicId); }
  const rows = await query(`SELECT question_id FROM review_items WHERE user_id=? AND mastered=0 ${extra} ORDER BY times_wrong DESC, RAND() LIMIT ?`,
    [...params, clamp(Number(req.body.count) || 20, 5, 60)]);
  if (!rows.length) throw new HttpError(404, 'কোনো অমীমাংসিত ভুল প্রশ্ন নেই');
  const { exam, neg, sec } = await examDefaults(req.user);
  const id = await createTest({ title: 'বারবার ভুল হওয়া প্রশ্নের রি-টেস্ট', kind: 'mistakes', track: req.user.track, examId: exam?.id,
    questionIds: shuffle(rows.map((x) => x.question_id)), durationSec: rows.length * sec, negativeMark: neg, userId: req.user.id });
  res.json({ test_id: id });
}));

r.post('/current-affairs', asyncH(async (req, res) => {
  const caId = Number(req.body.currentAffairId) || null;
  const rows = await query(
    `SELECT q.id FROM questions q JOIN current_affairs ca ON ca.id=q.current_affair_id
      WHERE q.status='active' AND (? IS NULL OR q.current_affair_id=?)
      ORDER BY (SELECT COUNT(*) FROM attempt_answers aa WHERE aa.user_id=? AND aa.question_id=q.id) ASC, ca.published_on DESC LIMIT ?`,
    [caId, caId, req.user.id, clamp(Number(req.body.count) || 5, 3, 40)]);
  if (!rows.length) throw new HttpError(404, 'সাম্প্রতিক বিষয়ের প্রশ্ন নেই');
  const id = await createTest({ title: 'সাম্প্রতিক বিষয়াবলি কুইজ', kind: 'current_affairs', track: req.user.track, questionIds: rows.map((x) => x.id), instantFeedback: true, userId: req.user.id });
  res.json({ test_id: id });
}));

// "I have 40 minutes" → the most useful session for right now.
r.post('/session', asyncH(async (req, res) => {
  await requirePro(req.user, 'সময়ভিত্তিক পার্সোনাল সেশন');
  const minutes = clamp(Number(req.body.minutes) || 30, 10, 240);
  const s = await buildSession(req.user, minutes);
  if (!s.questionIds.length) throw new HttpError(404, 'প্রশ্ন পাওয়া যায়নি');
  const id = await createTest({ title: `${minutes} মিনিটের পার্সোনাল সেশন`, kind: 'session', track: req.user.track, examId: s.exam?.id,
    questionIds: s.questionIds, durationSec: s.durationSec, negativeMark: s.exam ? Number(s.exam.negative_mark) : 0, meta: { plan: s.plan }, userId: req.user.id });
  res.json({ test_id: id, plan: s.plan });
}));

// Start one of today's mission items.
r.post('/mission/:key', asyncH(async (req, res) => {
  const mission = await getMission(req.user);
  const item = mission.items.find((i) => i.key === req.params.key);
  if (!item) throw new HttpError(404, 'মিশন আইটেম পাওয়া যায়নি');
  const { exam, neg, sec } = await examDefaults(req.user);
  const meta = { mission: { date: mission.date, key: item.key } };
  let ids = [], opts = {};
  if (item.type === 'revision') { ids = await dueReviewIds(req.user.id, item.count); opts = { instantFeedback: true }; }
  else if (item.type === 'adaptive') {
    const sIds = exam ? (await examSubjects(exam.id)).map((s) => s.id) : [];
    ids = await pickAdaptive(req.user.id, { subjectIds: sIds, topicIds: item.topicIds || [], count: item.count, focus: 'weak' });
    opts = { durationSec: ids.length * sec, negativeMark: neg };
  } else if (item.type === 'current_affairs') {
    ids = (await query(`SELECT q.id FROM questions q JOIN current_affairs ca ON ca.id=q.current_affair_id WHERE q.status='active'
        AND q.id NOT IN (SELECT question_id FROM attempt_answers WHERE user_id=?) ORDER BY ca.published_on DESC LIMIT ?`, [req.user.id, item.count])).map((x) => x.id);
    if (!ids.length) ids = (await query(`SELECT id FROM questions WHERE current_affair_id IS NOT NULL AND status='active' ORDER BY RAND() LIMIT ?`, [item.count])).map((x) => x.id);
    opts = { instantFeedback: true };
  } else if (item.type === 'mock') {
    ids = await pickMock(req.user.id, exam, item.count);
    opts = { durationSec: ids.length * exam.sec_per_question, negativeMark: neg };
  }
  if (!ids.length) throw new HttpError(404, 'এই আইটেমের জন্য প্রশ্ন নেই');
  const kind = item.type === 'mock' ? 'mock' : 'mission';
  const id = await createTest({ title: item.title, kind, track: req.user.track, examId: exam?.id, questionIds: ids, meta, userId: req.user.id, ...opts });
  res.json({ test_id: id });
}));

// ---------- Live exams ----------
r.get('/live', asyncH(async (req, res) => {
  const rows = await query(
    `SELECT t.id, t.title, t.track, t.exam_id, t.duration_sec, t.negative_mark, t.starts_at, t.ends_at,
            (SELECT COUNT(*) FROM test_questions tq WHERE tq.test_id=t.id) questions,
            (SELECT COUNT(*) FROM attempts a WHERE a.test_id=t.id AND a.status='submitted') participants,
            (SELECT a.id FROM attempts a WHERE a.test_id=t.id AND a.user_id=? LIMIT 1) my_attempt_id,
            (SELECT a.status FROM attempts a WHERE a.test_id=t.id AND a.user_id=? LIMIT 1) my_status
       FROM tests t WHERE t.kind='live' AND (t.track IS NULL OR t.track=? OR ?='all')
      ORDER BY t.starts_at DESC LIMIT 60`, [req.user.id, req.user.id, req.user.track, req.query.all ? 'all' : '']);
  const now = new Date();
  res.json(rows.map((t) => ({ ...t, state: new Date(t.starts_at) > now ? 'upcoming' : new Date(t.ends_at) > now ? 'running' : 'ended' })));
}));

r.get('/:id/leaderboard', asyncH(async (req, res) => {
  const test = await one('SELECT * FROM tests WHERE id=?', [req.params.id]);
  if (!test) throw new HttpError(404, 'পরীক্ষা পাওয়া যায়নি');
  const rows = await query(
    `SELECT a.id attempt_id, a.user_id, u.name, u.district, u.institution, a.score, a.correct, a.wrong, a.time_spent_sec
       FROM attempts a JOIN users u ON u.id=a.user_id
      WHERE a.test_id=? AND a.status='submitted' AND a.flagged=0 AND (u.show_on_leaderboard=1 OR u.id=?)
      ORDER BY a.score DESC, a.time_spent_sec ASC LIMIT 200`, [test.id, req.user.id]);
  res.json({ test: { id: test.id, title: test.title, kind: test.kind, ends_at: test.ends_at }, rows: rows.map((x, i) => ({ ...x, rank: i + 1, score: Number(x.score) })) });
}));

// "Can you beat my score?" — a shareable copy of any test the user finished.
r.post('/:id/challenge', asyncH(async (req, res) => {
  const attempt = await one(`SELECT * FROM attempts WHERE test_id=? AND user_id=? AND status='submitted' ORDER BY id DESC LIMIT 1`, [req.params.id, req.user.id]);
  if (!attempt) throw new HttpError(400, 'আগে পরীক্ষাটি শেষ করুন');
  const test = await one('SELECT * FROM tests WHERE id=?', [req.params.id]);
  const qs = await testQuestions(test.id);
  const id = await createTest({ title: `${req.user.name}-এর চ্যালেঞ্জ: ${test.title}`, kind: 'challenge', track: test.track, examId: test.exam_id,
    questionIds: qs.map((q) => q.id), durationSec: test.duration_sec || qs.length * 40, negativeMark: Number(test.negative_mark), isPublic: true,
    meta: { challenger: req.user.name, challenger_score: Number(attempt.score), total: attempt.total, source_test: test.id }, userId: req.user.id });
  res.json({ test_id: id });
}));

// ---------- Taking a test ----------
function canTake(test, user) {
  if (test.created_by === user.id || test.is_public || ['live', 'challenge'].includes(test.kind)) return true;
  return ['admin', 'teacher'].includes(user.role);
}

r.post('/:id/start', asyncH(async (req, res) => {
  const test = await one('SELECT * FROM tests WHERE id=?', [req.params.id]);
  if (!test || !canTake(test, req.user)) throw new HttpError(404, 'পরীক্ষা পাওয়া যায়নি');
  const now = new Date();
  if (test.kind === 'live') {
    if (new Date(test.starts_at) > now) throw new HttpError(400, 'লাইভ পরীক্ষা এখনো শুরু হয়নি');
    if (new Date(test.ends_at) < now) throw new HttpError(400, 'লাইভ পরীক্ষার সময় শেষ — ফলাফল ও লিডারবোর্ড দেখুন');
  }
  // Lock the user row so two concurrent starts can't open two attempts.
  const attempt = await tx(async (q) => {
    await q('SELECT id FROM users WHERE id=? FOR UPDATE', [req.user.id]);
    const [last] = await q('SELECT * FROM attempts WHERE test_id=? AND user_id=? ORDER BY id DESC LIMIT 1', [test.id, req.user.id]);
    if (last && (last.status === 'in_progress' || ['live', 'challenge'].includes(test.kind))) return last;
    const ins = await q('INSERT INTO attempts (user_id, test_id, started_at) VALUES (?,?,NOW())', [req.user.id, test.id]);
    return (await q('SELECT * FROM attempts WHERE id=?', [ins.insertId]))[0];
  });
  if (attempt.status === 'submitted') return res.json({ already_submitted: true, attempt_id: attempt.id });
  const qs = await testQuestions(test.id);
  const elapsed = Math.round((now - new Date(attempt.started_at)) / 1000);
  let remaining = test.duration_sec ? Math.max(0, test.duration_sec - elapsed) : null;
  if (test.kind === 'live' && remaining != null) remaining = Math.min(remaining, Math.round((new Date(test.ends_at) - now) / 1000));
  res.json({
    attempt_id: attempt.id, remaining_sec: remaining,
    test: { id: test.id, title: test.title, kind: test.kind, duration_sec: test.duration_sec, negative_mark: Number(test.negative_mark),
      instant_feedback: !!test.instant_feedback, meta: parseJson(test.meta, {}) },
    questions: qs.map((q) => ({ id: q.id, position: q.position, body: q.body, subject: q.subject_name, topic: q.topic_name,
      options: { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d }, exam_ref: q.exam_ref, year: q.year })),
  });
}));

export { liveResultsHidden };
export default r;
