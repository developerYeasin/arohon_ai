// Leaderboards, question discussions, reports, bookmarks, current affairs and the coach.
import { Router } from 'express';
import { query, one } from '../db.js';
import { auth, requireRole } from '../middleware/auth.js';
import { asyncH, HttpError, parseJson, toBn } from '../services/util.js';
import { coachReply } from '../services/coach.js';
import { getAccess, coachUsedToday, upgradeError, FREE_LIMITS } from '../services/billing.js';

const r = Router();
r.use(auth);

// ---------- Leaderboard ----------
r.get('/leaderboard', asyncH(async (req, res) => {
  const scope = req.query.scope || 'national';
  const period = req.query.period === 'all' ? 'all' : 'week';
  const where = ['u.show_on_leaderboard=1', 'u.track=?']; const params = [req.user.track];
  if (scope === 'district') { where.push('u.district=?'); params.push(req.user.district || '__none__'); }
  if (scope === 'institution') { where.push('u.institution=?'); params.push(req.user.institution || '__none__'); }
  const periodSql = period === 'week' ? 'AND a.submitted_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY' : '';
  const rows = await query(
    `SELECT u.id, u.name, u.district, u.institution, u.streak,
            COALESCE(SUM(a.xp_earned),0) xp, COUNT(a.id) tests,
            ROUND(100*SUM(a.correct)/NULLIF(SUM(a.correct+a.wrong),0)) accuracy
       FROM users u JOIN attempts a ON a.user_id=u.id AND a.status='submitted' AND a.flagged=0 ${periodSql}
      WHERE ${where.join(' AND ')} GROUP BY u.id ORDER BY xp DESC LIMIT 100`, params);
  const ranked = rows.map((x, i) => ({ ...x, rank: i + 1, xp: Number(x.xp) }));
  res.json({ scope, period, rows: ranked, me: ranked.find((x) => x.id === req.user.id) || null });
}));

r.get('/leaderboard/districts', asyncH(async (req, res) => {
  res.json(await query(
    `SELECT u.district, COUNT(DISTINCT u.id) students, COALESCE(SUM(a.xp_earned),0) xp,
            ROUND(100*SUM(a.correct)/NULLIF(SUM(a.correct+a.wrong),0)) accuracy
       FROM users u JOIN attempts a ON a.user_id=u.id AND a.status='submitted' AND a.flagged=0 AND a.submitted_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY
      WHERE u.district IS NOT NULL AND u.track=? GROUP BY u.district ORDER BY xp DESC LIMIT 64`, [req.user.track]));
}));

// ---------- Question page & community ----------
r.get('/questions/:id', asyncH(async (req, res) => {
  const q = await one(
    `SELECT q.*, s.name_bn subject, t.name_bn topic FROM questions q JOIN subjects s ON s.id=q.subject_id JOIN topics t ON t.id=q.topic_id WHERE q.id=?`, [req.params.id]);
  if (!q) throw new HttpError(404, 'প্রশ্ন পাওয়া যায়নি');
  // Answer is only revealed if the student has already attempted it (keeps live exams fair).
  const seen = await one('SELECT 1 x FROM attempt_answers WHERE user_id=? AND question_id=? LIMIT 1', [req.user.id, q.id]);
  const reveal = !!seen || ['admin', 'teacher'].includes(req.user.role);
  const discussions = await query(
    `SELECT d.*, u.name, u.role, (SELECT value FROM discussion_votes v WHERE v.discussion_id=d.id AND v.user_id=?) my_vote
       FROM discussions d JOIN users u ON u.id=d.user_id WHERE d.question_id=? ORDER BY d.is_verified DESC, d.score DESC, d.id ASC`, [req.user.id, q.id]);
  const related = await query(`SELECT id, body FROM questions WHERE topic_id=? AND id<>? AND status='active' ORDER BY RAND() LIMIT 5`, [q.topic_id, q.id]);
  const history = await query('SELECT version, change_note, changed_at FROM question_versions WHERE question_id=? ORDER BY version DESC', [q.id]);
  res.json({
    id: q.id, body: q.body, options: { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d },
    correct: reveal ? q.correct_option : null, explanation: reveal ? q.explanation : null, revealed: reveal,
    subject: q.subject, topic: q.topic, source: q.source, exam_ref: q.exam_ref, year: q.year, difficulty: q.difficulty,
    status: q.status, version: q.version, last_verified_at: q.last_verified_at,
    stats: { attempts: q.attempt_count, accuracy: q.attempt_count ? Math.round((100 * q.correct_count) / q.attempt_count) : null,
      avg_sec: q.attempt_count ? Math.round(q.total_time_ms / 1000 / q.attempt_count) : null },
    discussions, related, history,
  });
}));

r.post('/questions/:id/discussions', asyncH(async (req, res) => {
  const body = (req.body.body || '').trim();
  if (body.length < 3) throw new HttpError(400, 'মন্তব্য লিখুন');
  const ins = await query('INSERT INTO discussions (question_id, user_id, body) VALUES (?,?,?)', [req.params.id, req.user.id, body.slice(0, 3000)]);
  res.json({ id: ins.insertId });
}));

r.post('/discussions/:id/vote', asyncH(async (req, res) => {
  const value = Number(req.body.value) > 0 ? 1 : Number(req.body.value) < 0 ? -1 : 0;
  if (value === 0) await query('DELETE FROM discussion_votes WHERE discussion_id=? AND user_id=?', [req.params.id, req.user.id]);
  else await query('INSERT INTO discussion_votes (discussion_id, user_id, value) VALUES (?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)', [req.params.id, req.user.id, value]);
  await query('UPDATE discussions SET score=(SELECT COALESCE(SUM(value),0) FROM discussion_votes WHERE discussion_id=?) WHERE id=?', [req.params.id, req.params.id]);
  res.json({ ok: true });
}));

r.post('/discussions/:id/verify', requireRole('admin', 'teacher'), asyncH(async (req, res) => {
  await query('UPDATE discussions SET is_verified=1-is_verified WHERE id=?', [req.params.id]);
  res.json({ ok: true });
}));

r.post('/questions/:id/report', asyncH(async (req, res) => {
  const reasons = ['wrong_answer', 'outdated', 'ambiguous', 'typo', 'bad_explanation', 'duplicate', 'other'];
  if (!reasons.includes(req.body.reason)) throw new HttpError(400, 'কারণ নির্বাচন করুন');
  const open = await one(`SELECT id FROM question_reports WHERE question_id=? AND user_id=? AND status='open'`, [req.params.id, req.user.id]);
  if (open) throw new HttpError(409, 'আপনার রিপোর্ট ইতিমধ্যে পর্যালোচনায় আছে');
  await query('INSERT INTO question_reports (question_id, user_id, reason, note) VALUES (?,?,?,?)', [req.params.id, req.user.id, req.body.reason, req.body.note || null]);
  await query('UPDATE questions SET report_count=report_count+1 WHERE id=?', [req.params.id]);
  // Three independent open reports → pulled from circulation until an expert reviews it.
  const n = await one(`SELECT COUNT(DISTINCT user_id) n FROM question_reports WHERE question_id=? AND status='open'`, [req.params.id]);
  if (n.n >= 3) await query(`UPDATE questions SET status='needs_review' WHERE id=? AND status='active'`, [req.params.id]);
  res.json({ ok: true });
}));

r.get('/my-reports', asyncH(async (req, res) => {
  res.json(await query(
    `SELECT r.id, r.question_id, r.reason, r.status, r.resolution_note, r.created_at, r.resolved_at, LEFT(q.body, 120) body
       FROM question_reports r JOIN questions q ON q.id=r.question_id WHERE r.user_id=? ORDER BY r.id DESC LIMIT 50`, [req.user.id]));
}));

r.post('/questions/:id/bookmark', asyncH(async (req, res) => {
  const ex = await one('SELECT 1 x FROM bookmarks WHERE user_id=? AND question_id=?', [req.user.id, req.params.id]);
  if (ex) await query('DELETE FROM bookmarks WHERE user_id=? AND question_id=?', [req.user.id, req.params.id]);
  else await query('INSERT INTO bookmarks (user_id, question_id) VALUES (?,?)', [req.user.id, req.params.id]);
  res.json({ bookmarked: !ex });
}));

r.get('/bookmarks', asyncH(async (req, res) => {
  res.json(await query(
    `SELECT q.id, q.body, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option, q.explanation, t.name_bn topic, s.name_bn subject
       FROM bookmarks b JOIN questions q ON q.id=b.question_id JOIN topics t ON t.id=q.topic_id JOIN subjects s ON s.id=q.subject_id
      WHERE b.user_id=? ORDER BY b.created_at DESC`, [req.user.id]));
}));

// ---------- Current affairs ----------
r.get('/current-affairs', asyncH(async (req, res) => {
  const params = []; let where = '';
  if (req.query.category) { where = 'WHERE ca.category=?'; params.push(req.query.category); }
  const rows = await query(
    `SELECT ca.*, (SELECT COUNT(*) FROM questions q WHERE q.current_affair_id=ca.id AND q.status='active') questions
       FROM current_affairs ca ${where} ORDER BY ca.published_on DESC, ca.id DESC LIMIT 100`, params);
  res.json(rows.map((x) => ({ ...x, key_facts: parseJson(x.key_facts, []) })));
}));

// ---------- AI Coach ----------
r.get('/coach/history', asyncH(async (req, res) => {
  res.json(await query('SELECT id, role, content, created_at FROM coach_messages WHERE user_id=? ORDER BY id DESC LIMIT 40', [req.user.id]).then((x) => x.reverse()));
}));

r.post('/coach', asyncH(async (req, res) => {
  const message = (req.body.message || '').trim().slice(0, 2000);
  if (!message) throw new HttpError(400, 'প্রশ্ন লিখুন');
  const access = await getAccess(req.user);
  if (!access.pro && (await coachUsedToday(req.user.id)) >= FREE_LIMITS.coach_per_day) {
    throw upgradeError(`ফ্রি প্যাকেজে দিনে ${toBn(FREE_LIMITS.coach_per_day)}টি কোচ প্রশ্ন। এক্সাম পাসে সীমাহীন।`);
  }
  const reply = await coachReply(req.user, message, { allowLLM: access.ai_coach });
  await query('INSERT INTO coach_messages (user_id, role, content) VALUES (?,?,?), (?,?,?)',
    [req.user.id, 'user', message, req.user.id, 'assistant', reply.text]);
  res.json(reply);
}));

export default r;
