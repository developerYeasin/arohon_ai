// Written-answer practice (AI/heuristic feedback → peer review → expert review) and viva simulation.
import { Router } from 'express';
import { query, one } from '../db.js';
import { auth, requireRole } from '../middleware/auth.js';
import { asyncH, HttpError, parseJson, shuffle, clamp } from '../services/util.js';
import { getAccess, requirePro, upgradeError } from '../services/billing.js';
import { evaluateWritten, countWords, DEFAULT_RUBRIC } from '../services/written.js';
import { evaluateVivaAnswer, summarize, CATEGORY_BN } from '../services/viva.js';
import { aiEnabled } from '../services/ai.js';

const r = Router();
r.use(auth);

const FREE_WRITTEN_PER_WEEK = 1;
const FREE_VIVA_PER_WEEK = 1;
const MAX_FOLLOW_UPS = 3;

// ================= Written =================
r.get('/written/prompts', asyncH(async (req, res) => {
  const track = req.query.track || req.user.track;
  res.json({
    ai: aiEnabled(),
    prompts: await query(
      `SELECT p.id, p.title, p.marks, p.word_limit, p.time_min, p.source, s.name_bn subject, e.name_bn exam,
              (SELECT COUNT(*) FROM written_submissions w WHERE w.prompt_id=p.id AND w.user_id=?) my_attempts,
              (SELECT MAX(COALESCE(w.expert_score, w.auto_score)) FROM written_submissions w WHERE w.prompt_id=p.id AND w.user_id=?) my_best
         FROM written_prompts p LEFT JOIN subjects s ON s.id=p.subject_id LEFT JOIN exams e ON e.id=p.exam_id
        WHERE p.is_active=1 AND p.track=? ORDER BY p.id`, [req.user.id, req.user.id, track]),
  });
}));

r.get('/written/prompts/:id', asyncH(async (req, res) => {
  const p = await one('SELECT * FROM written_prompts WHERE id=? AND is_active=1', [req.params.id]);
  if (!p) throw new HttpError(404, 'প্রশ্ন পাওয়া যায়নি');
  const attempted = await one('SELECT 1 x FROM written_submissions WHERE prompt_id=? AND user_id=? LIMIT 1', [p.id, req.user.id]);
  res.json({ ...p, rubric: parseJson(p.rubric, DEFAULT_RUBRIC), key_points: undefined, model_answer: attempted ? p.model_answer : null, attempted: !!attempted });
}));

r.post('/written/prompts/:id/submit', asyncH(async (req, res) => {
  const p = await one('SELECT * FROM written_prompts WHERE id=? AND is_active=1', [req.params.id]);
  if (!p) throw new HttpError(404, 'প্রশ্ন পাওয়া যায়নি');
  const answer = String(req.body.answer || '').trim();
  if (countWords(answer) < 20) throw new HttpError(400, 'কমপক্ষে ২০ শব্দের উত্তর লিখুন');
  if (answer.length > 30000) throw new HttpError(400, 'উত্তর অনেক বড়');
  const access = await getAccess(req.user);
  if (!access.pro) {
    const n = await one('SELECT COUNT(*) n FROM written_submissions WHERE user_id=? AND created_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY', [req.user.id]);
    if (n.n >= FREE_WRITTEN_PER_WEEK) throw upgradeError('ফ্রি প্যাকেজে সপ্তাহে ১টি লিখিত উত্তরের মূল্যায়ন। এক্সাম পাসে সীমাহীন — সঙ্গে বিশেষজ্ঞ রিভিউয়ের সুযোগ।');
  }
  const timeSpent = clamp(Number(req.body.time_spent_sec) || 0, 0, 4 * 3600);
  const fb = await evaluateWritten(p, answer, timeSpent);
  const ins = await query(
    `INSERT INTO written_submissions (user_id, prompt_id, answer, word_count, time_spent_sec, auto_feedback, auto_score, auto_engine, allow_peer)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [req.user.id, p.id, answer, countWords(answer), timeSpent, JSON.stringify(fb), fb.provisional_marks, fb.engine, req.body.allow_peer === false ? 0 : 1]);
  await query('UPDATE users SET xp=xp+15 WHERE id=?', [req.user.id]);
  res.json({ id: ins.insertId });
}));

r.get('/written/mine', asyncH(async (req, res) => {
  res.json(await query(
    `SELECT w.id, w.prompt_id, p.title, p.marks, w.word_count, w.auto_score, w.auto_engine, w.expert_requested, w.expert_score, w.created_at,
            (SELECT COUNT(*) FROM peer_reviews pr WHERE pr.submission_id=w.id) peer_count
       FROM written_submissions w JOIN written_prompts p ON p.id=w.prompt_id WHERE w.user_id=? ORDER BY w.id DESC LIMIT 100`, [req.user.id]));
}));

r.get('/written/submissions/:id', asyncH(async (req, res) => {
  const w = await one('SELECT * FROM written_submissions WHERE id=?', [req.params.id]);
  const staff = ['admin', 'teacher'].includes(req.user.role);
  if (!w || (w.user_id !== req.user.id && !staff)) throw new HttpError(404, 'উত্তর পাওয়া যায়নি');
  const p = await one('SELECT * FROM written_prompts WHERE id=?', [w.prompt_id]);
  const peers = await query('SELECT id, scores, total, comment, helpful, created_at FROM peer_reviews WHERE submission_id=? ORDER BY id', [w.id]);
  const expert = w.expert_id ? await one('SELECT name FROM users WHERE id=?', [w.expert_id]) : null;
  res.json({
    ...w, auto_feedback: parseJson(w.auto_feedback, null), expert_name: expert?.name || null,
    prompt: { ...p, rubric: parseJson(p.rubric, DEFAULT_RUBRIC), key_points: parseJson(p.key_points, []) },
    peer_reviews: peers.map((x) => ({ ...x, scores: parseJson(x.scores, {}) })),
  });
}));

r.post('/written/submissions/:id/request-expert', asyncH(async (req, res) => {
  await requirePro(req.user, 'বিশেষজ্ঞ রিভিউ');
  const w = await one('SELECT * FROM written_submissions WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
  if (!w) throw new HttpError(404, 'উত্তর পাওয়া যায়নি');
  const pending = await one('SELECT COUNT(*) n FROM written_submissions WHERE user_id=? AND expert_requested=1 AND expert_at IS NULL', [req.user.id]);
  if (pending.n >= 3) throw new HttpError(429, 'একসাথে সর্বোচ্চ ৩টি উত্তর বিশেষজ্ঞ রিভিউয়ের অপেক্ষায় রাখা যায়');
  await query('UPDATE written_submissions SET expert_requested=1 WHERE id=?', [w.id]);
  res.json({ ok: true });
}));

// ---- Peer review: anonymous, rubric-based; reviewers earn XP, owners rate helpfulness ----
r.get('/written/peer/next', asyncH(async (req, res) => {
  const w = await one(
    `SELECT w.id, w.answer, w.word_count, w.prompt_id, p.title, p.prompt, p.marks, p.word_limit, p.rubric,
            (SELECT COUNT(*) FROM peer_reviews pr WHERE pr.submission_id=w.id) n,
            EXISTS(SELECT 1 FROM written_submissions m WHERE m.user_id=? AND m.prompt_id=w.prompt_id) familiar
       FROM written_submissions w JOIN written_prompts p ON p.id=w.prompt_id
      WHERE w.user_id<>? AND w.allow_peer=1 AND p.track=?
        AND NOT EXISTS (SELECT 1 FROM peer_reviews pr WHERE pr.submission_id=w.id AND pr.reviewer_id=?)
      HAVING n < 3 ORDER BY familiar DESC, n ASC, w.id DESC LIMIT 1`, [req.user.id, req.user.id, req.user.track, req.user.id]);
  res.json(w ? { ...w, rubric: parseJson(w.rubric, DEFAULT_RUBRIC) } : null);
}));

r.post('/written/peer/:submissionId', asyncH(async (req, res) => {
  const w = await one('SELECT w.*, p.rubric, p.marks FROM written_submissions w JOIN written_prompts p ON p.id=w.prompt_id WHERE w.id=?', [req.params.submissionId]);
  if (!w || w.user_id === req.user.id || !w.allow_peer) throw new HttpError(404, 'উত্তর পাওয়া যায়নি');
  const rubric = parseJson(w.rubric, DEFAULT_RUBRIC);
  const scores = {};
  for (const c of rubric) scores[c.key] = clamp(Number(req.body.scores?.[c.key]) || 0, 0, 100);
  const comment = String(req.body.comment || '').trim();
  if (comment.length < 20) throw new HttpError(400, 'কমপক্ষে ২০ অক্ষরের গঠনমূলক মন্তব্য লিখুন');
  const pct = rubric.reduce((s, c) => s + c.weight * scores[c.key], 0) / rubric.reduce((s, c) => s + c.weight, 0);
  const total = Math.round((pct / 100) * w.marks * 2) / 2;
  await query('INSERT INTO peer_reviews (submission_id, reviewer_id, scores, total, comment) VALUES (?,?,?,?,?)', [w.id, req.user.id, JSON.stringify(scores), total, comment.slice(0, 3000)]);
  await query('UPDATE users SET xp=xp+10 WHERE id=?', [req.user.id]);
  res.json({ ok: true });
}));

r.post('/written/peer-reviews/:id/helpful', asyncH(async (req, res) => {
  await query(`UPDATE peer_reviews pr JOIN written_submissions w ON w.id=pr.submission_id SET pr.helpful=? WHERE pr.id=? AND w.user_id=?`,
    [req.body.helpful ? 1 : 0, req.params.id, req.user.id]);
  res.json({ ok: true });
}));

// ---- Expert review queue (teachers/admins) ----
r.get('/expert/queue', requireRole('admin', 'teacher'), asyncH(async (req, res) => {
  res.json(await query(
    `SELECT w.id, w.word_count, w.auto_score, w.created_at, p.title, p.marks, u.name
       FROM written_submissions w JOIN written_prompts p ON p.id=w.prompt_id JOIN users u ON u.id=w.user_id
      WHERE w.expert_requested=1 AND w.expert_at IS NULL ORDER BY w.id ASC LIMIT 100`));
}));

r.post('/expert/:id', requireRole('admin', 'teacher'), asyncH(async (req, res) => {
  const w = await one('SELECT w.*, p.marks FROM written_submissions w JOIN written_prompts p ON p.id=w.prompt_id WHERE w.id=?', [req.params.id]);
  if (!w) throw new HttpError(404, 'উত্তর পাওয়া যায়নি');
  const score = Number(req.body.score);
  if (!(score >= 0 && score <= w.marks)) throw new HttpError(400, `০ থেকে ${w.marks} এর মধ্যে নম্বর দিন`);
  if (String(req.body.feedback || '').trim().length < 20) throw new HttpError(400, 'বিস্তারিত মতামত লিখুন');
  await query('UPDATE written_submissions SET expert_id=?, expert_score=?, expert_feedback=?, expert_at=UTC_TIMESTAMP() WHERE id=?',
    [req.user.id, score, req.body.feedback.trim(), w.id]);
  res.json({ ok: true });
}));

// ================= Viva =================
const MIX = [['personal', 1], ['motivation', 1], ['district', 1], ['liberation', 1], ['constitution', 1], ['bangladesh', 1], ['current', 1], ['international', 1], ['situational', 1]];

r.post('/viva/sessions', asyncH(async (req, res) => {
  const access = await getAccess(req.user);
  if (!access.pro) {
    const n = await one('SELECT COUNT(*) n FROM viva_sessions WHERE user_id=? AND created_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY', [req.user.id]);
    if (n.n >= FREE_VIVA_PER_WEEK) throw upgradeError('ফ্রি প্যাকেজে সপ্তাহে ১টি মক ভাইভা। এক্সাম পাসে সীমাহীন।');
  }
  const count = clamp(Number(req.body.count) || 8, 3, 15);
  const pool = await query('SELECT id, category FROM viva_questions WHERE is_active=1 AND track=?', [req.user.track]);
  if (!pool.length) throw new HttpError(404, 'আপনার ট্র্যাকের জন্য এখনো ভাইভা প্রশ্ন যোগ হয়নি');
  const byCat = new Map();
  for (const q of shuffle(pool)) (byCat.get(q.category) || byCat.set(q.category, []).get(q.category)).push(q.id);
  const ids = [];
  // Boards open with the candidate, then move through Bangladesh, current and situational questions.
  for (const [cat, n] of MIX) ids.push(...(byCat.get(cat) || []).splice(0, n));
  for (const q of shuffle(pool)) if (ids.length < count && !ids.includes(q.id)) ids.push(q.id);
  const ins = await query('INSERT INTO viva_sessions (user_id, exam_id, question_ids) VALUES (?,?,?)', [req.user.id, req.user.target_exam_id, JSON.stringify(ids.slice(0, count))]);
  res.json({ id: ins.insertId });
}));

async function sessionState(sessionId, user) {
  const s = await one('SELECT * FROM viva_sessions WHERE id=?', [sessionId]);
  if (!s || s.user_id !== user.id) throw new HttpError(404, 'সেশন পাওয়া যায়নি');
  const ids = parseJson(s.question_ids, []);
  const qs = ids.length ? await query('SELECT * FROM viva_questions WHERE id IN (?)', [ids]) : [];
  const qMap = new Map(qs.map((q) => [q.id, q]));
  const answers = (await query('SELECT * FROM viva_answers WHERE session_id=? ORDER BY id', [s.id])).map((a) => ({ ...a, feedback: parseJson(a.feedback, null) }));
  let current = null;
  const followUpsUsed = answers.filter((a) => a.is_follow_up).length;
  for (const id of ids) {
    const main = answers.find((a) => a.question_id === id && !a.is_follow_up);
    if (!main) { current = { question_id: id, text: qMap.get(id)?.question, category: qMap.get(id)?.category, is_follow_up: false }; break; }
    const fu = main.feedback?.follow_up;
    const fuAnswered = answers.some((a) => a.question_id === id && a.is_follow_up);
    const isLastAnswered = answers[answers.length - 1]?.id === main.id;
    if (fu && !fuAnswered && isLastAnswered && followUpsUsed < MAX_FOLLOW_UPS) {
      current = { question_id: id, text: fu, category: qMap.get(id)?.category, is_follow_up: true }; break;
    }
  }
  return { s, ids, qMap, answers, current };
}

r.get('/viva/sessions', asyncH(async (req, res) => {
  res.json(await query(`SELECT id, status, summary, created_at, completed_at, JSON_LENGTH(question_ids) questions FROM viva_sessions WHERE user_id=? ORDER BY id DESC LIMIT 30`, [req.user.id])
    .then((rows) => rows.map((x) => ({ ...x, summary: parseJson(x.summary, null) }))));
}));

r.get('/viva/sessions/:id', asyncH(async (req, res) => {
  const { s, ids, qMap, answers, current } = await sessionState(req.params.id, req.user);
  res.json({
    id: s.id, status: s.status, total: ids.length, summary: parseJson(s.summary, null), ai: aiEnabled(), current,
    answers: answers.map((a) => ({ ...a, category: qMap.get(a.question_id)?.category, guidance: s.status === 'completed' ? qMap.get(a.question_id)?.guidance : undefined })),
    categories: CATEGORY_BN,
  });
}));

r.post('/viva/sessions/:id/answer', asyncH(async (req, res) => {
  const { s, qMap, current } = await sessionState(req.params.id, req.user);
  if (s.status === 'completed' || !current) throw new HttpError(400, 'সেশন শেষ হয়েছে');
  const skipped = !!req.body.skip;
  const answer = skipped ? '(উত্তর দেননি)' : String(req.body.answer || '').trim();
  if (!skipped && countWords(answer) < 3) throw new HttpError(400, 'উত্তর বলুন বা লিখুন (অথবা "পরের প্রশ্ন" চাপুন)');
  const duration = clamp(Number(req.body.duration_sec) || 0, 0, 900);
  const mode = req.body.input_mode === 'voice' ? 'voice' : 'text';
  const q = qMap.get(current.question_id);
  // Follow-ups have no prepared key points, so they're judged on delivery and (with AI) on content.
  const feedback = skipped ? null : await evaluateVivaAnswer(current.is_follow_up ? { guidance: q?.guidance } : q, current.text, answer, duration, mode);
  if (current.is_follow_up && feedback) feedback.follow_up = null; // one follow-up per question keeps sessions bounded
  await query('INSERT INTO viva_answers (session_id, question_id, question_text, is_follow_up, answer, duration_sec, input_mode, feedback) VALUES (?,?,?,?,?,?,?,?)',
    [s.id, current.question_id, current.text, current.is_follow_up ? 1 : 0, answer, duration, mode, feedback ? JSON.stringify(feedback) : null]);
  const next = await sessionState(s.id, req.user);
  if (!next.current) {
    const summary = summarize(next.answers.map((a) => ({ ...a, category: next.qMap.get(a.question_id)?.category })));
    await query(`UPDATE viva_sessions SET status='completed', completed_at=UTC_TIMESTAMP(), summary=? WHERE id=?`, [JSON.stringify(summary), s.id]);
    await query('UPDATE users SET xp=xp+25 WHERE id=?', [req.user.id]);
  }
  res.json({ feedback, done: !next.current });
}));

// ================= Content management =================
r.post('/admin/written-prompts', requireRole('admin', 'teacher'), asyncH(async (req, res) => {
  const b = req.body;
  if (!b.title || !b.prompt || !b.track) throw new HttpError(400, 'শিরোনাম, প্রশ্ন ও ট্র্যাক দিন');
  const ins = await query('INSERT INTO written_prompts SET ?', [{
    track: b.track, exam_id: b.exam_id || null, subject_id: b.subject_id || null, title: b.title, prompt: b.prompt, marks: Number(b.marks) || 10,
    word_limit: Number(b.word_limit) || 300, time_min: Number(b.time_min) || 20, key_points: JSON.stringify(b.key_points || []),
    model_answer: b.model_answer || null, rubric: JSON.stringify(b.rubric || DEFAULT_RUBRIC), source: b.source || null, created_by: req.user.id }]);
  res.json({ id: ins.insertId });
}));

r.post('/admin/viva-questions', requireRole('admin', 'teacher'), asyncH(async (req, res) => {
  const b = req.body;
  if (!b.question || !b.category || !CATEGORY_BN[b.category]) throw new HttpError(400, 'প্রশ্ন ও সঠিক বিভাগ দিন');
  const ins = await query('INSERT INTO viva_questions SET ?', [{
    track: b.track || 'job', exam_id: b.exam_id || null, category: b.category, question: b.question, guidance: b.guidance || null,
    key_points: JSON.stringify(b.key_points || []), follow_ups: JSON.stringify(b.follow_ups || []) }]);
  res.json({ id: ins.insertId });
}));

export default r;
