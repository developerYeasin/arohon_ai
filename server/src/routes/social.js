// 1-vs-1 battles, study groups / coaching batches, and referrals.
import { Router } from 'express';
import crypto from 'node:crypto';
import { query, one, tx } from '../db.js';
import { auth } from '../middleware/auth.js';
import { asyncH, HttpError, clamp, parseJson } from '../services/util.js';
import { createTest, pickAdaptive, getUserExam, examSubjects, pickMock } from '../services/engine.js';
import { testQuestions, submitAttempt } from '../services/attempts.js';

const r = Router();
r.use(auth);
const newCode = () => crypto.randomBytes(4).toString('base64url').replace(/[-_]/g, 'x').slice(0, 6).toUpperCase();

// ================= Battles =================
// Both players get the same questions under the same per-question timer. Progress is polled,
// so a battle works on slow connections without websockets. Results also feed each player's
// normal analytics (a battle is a real practice attempt).
const BATTLE_Q = 10;

async function battleView(b, userId) {
  const qs = await testQuestions(b.test_id);
  const players = await query(
    `SELECT u.id, u.name, u.district, COUNT(ba.question_id) answered, COALESCE(SUM(ba.is_correct),0) correct, COALESCE(SUM(ba.time_ms),0) time_ms
       FROM users u LEFT JOIN battle_answers ba ON ba.user_id=u.id AND ba.battle_id=?
      WHERE u.id IN (?) GROUP BY u.id`, [b.id, [b.creator_id, b.opponent_id].filter(Boolean)]);
  const mine = await query('SELECT question_id, selected, is_correct FROM battle_answers WHERE battle_id=? AND user_id=?', [b.id, userId]);
  const finished = b.status === 'finished';
  let winner = null;
  if (finished && players.length === 2) {
    const [a, c] = players;
    winner = a.correct !== c.correct ? (a.correct > c.correct ? a.id : c.id) : a.time_ms !== c.time_ms ? (a.time_ms < c.time_ms ? a.id : c.id) : 0;
  }
  return {
    id: b.id, code: b.code, status: b.status, per_question_sec: b.per_question_sec, started_at: b.started_at, is_open: !!b.is_open,
    me: userId, players: players.map((p) => ({ ...p, correct: Number(p.correct), time_ms: Number(p.time_ms), answered: Number(p.answered) })), winner,
    questions: b.status === 'waiting' ? [] : qs.map((q) => ({
      id: q.id, body: q.body, options: { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d }, subject: q.subject_name,
      ...(finished ? { correct: q.correct_option, explanation: q.explanation } : {}),
    })),
    my_answers: Object.fromEntries(mine.map((m) => [m.question_id, finished ? m : { selected: m.selected }])),
  };
}

async function finishIfDone(b) {
  if (b.status !== 'active') return b;
  const counts = await query('SELECT user_id, COUNT(*) n FROM battle_answers WHERE battle_id=? GROUP BY user_id', [b.id]);
  const total = (await one('SELECT COUNT(*) n FROM test_questions WHERE test_id=?', [b.test_id])).n;
  const bothDone = counts.length === 2 && counts.every((c) => c.n >= total);
  const timedOut = b.started_at && Date.now() - new Date(b.started_at).getTime() > (total * b.per_question_sec + 60) * 1000;
  if (!bothDone && !timedOut) return b;
  await query(`UPDATE battles SET status='finished' WHERE id=? AND status='active'`, [b.id]);
  // Record each player's answers as a normal attempt so battles count toward learning analytics.
  const test = await one('SELECT * FROM tests WHERE id=?', [b.test_id]);
  for (const uid of [b.creator_id, b.opponent_id]) {
    const answers = await query('SELECT question_id, selected, time_ms FROM battle_answers WHERE battle_id=? AND user_id=?', [b.id, uid]);
    const ins = await query('INSERT INTO attempts (user_id, test_id, started_at) VALUES (?,?,?)', [uid, test.id, b.started_at]);
    const attempt = await one('SELECT * FROM attempts WHERE id=?', [ins.insertId]);
    await submitAttempt(attempt, test, answers.map((a) => ({ question_id: a.question_id, selected: a.selected, time_ms: a.time_ms })));
  }
  return { ...b, status: 'finished' };
}

r.post('/battles', asyncH(async (req, res) => {
  const exam = await getUserExam(req.user);
  const sIds = exam ? (await examSubjects(exam.id)).map((s) => s.id) : [];
  const subjectId = Number(req.body.subject_id) || null;
  // Balanced (not weakness-targeted) selection so neither player is advantaged.
  const ids = await pickAdaptive(req.user.id, { subjectIds: subjectId ? [subjectId] : sIds, count: BATTLE_Q, focus: 'balanced' });
  if (ids.length < 5) throw new HttpError(404, 'যথেষ্ট প্রশ্ন নেই');
  const testId = await createTest({ title: '১-বনাম-১ ব্যাটল', kind: 'challenge', track: req.user.track, examId: exam?.id, questionIds: ids,
    negativeMark: 0, meta: { battle: true }, userId: req.user.id });
  const code = newCode();
  const ins = await query('INSERT INTO battles (code, test_id, creator_id, is_open, per_question_sec) VALUES (?,?,?,?,?)',
    [code, testId, req.user.id, req.body.open ? 1 : 0, clamp(Number(req.body.per_question_sec) || 20, 10, 60)]);
  res.json({ id: ins.insertId, code });
}));

// Random matchmaking: join the oldest open battle in your track, or create one and wait.
r.post('/battles/quick', asyncH(async (req, res) => {
  const b = await tx(async (q) => {
    const [open] = await q(
      `SELECT b.* FROM battles b JOIN tests t ON t.id=b.test_id
        WHERE b.is_open=1 AND b.status='waiting' AND b.creator_id<>? AND t.track=? AND b.created_at >= UTC_TIMESTAMP() - INTERVAL 10 MINUTE
        ORDER BY b.id LIMIT 1 FOR UPDATE`, [req.user.id, req.user.track]);
    if (!open) return null;
    await q(`UPDATE battles SET opponent_id=?, status='active', started_at=UTC_TIMESTAMP() WHERE id=?`, [req.user.id, open.id]);
    return open;
  });
  if (b) return res.json({ id: b.id, code: b.code, matched: true });
  req.body.open = true;
  const exam = await getUserExam(req.user);
  const ids = await pickAdaptive(req.user.id, { subjectIds: exam ? (await examSubjects(exam.id)).map((s) => s.id) : [], count: BATTLE_Q, focus: 'balanced' });
  const testId = await createTest({ title: '১-বনাম-১ ব্যাটল', kind: 'challenge', track: req.user.track, examId: exam?.id, questionIds: ids, meta: { battle: true }, userId: req.user.id });
  const code = newCode();
  const ins = await query('INSERT INTO battles (code, test_id, creator_id, is_open) VALUES (?,?,?,1)', [code, testId, req.user.id]);
  res.json({ id: ins.insertId, code, matched: false });
}));

r.post('/battles/join/:code', asyncH(async (req, res) => {
  const b = await one('SELECT * FROM battles WHERE code=?', [req.params.code.toUpperCase()]);
  if (!b) throw new HttpError(404, 'ব্যাটল পাওয়া যায়নি');
  if (b.creator_id === req.user.id || b.opponent_id === req.user.id) return res.json({ id: b.id });
  if (b.status !== 'waiting') throw new HttpError(409, 'এই ব্যাটলে ইতিমধ্যে দুজন আছেন');
  const upd = await query(`UPDATE battles SET opponent_id=?, status='active', started_at=UTC_TIMESTAMP() WHERE id=? AND status='waiting'`, [req.user.id, b.id]);
  if (!upd.affectedRows) throw new HttpError(409, 'এই ব্যাটলে ইতিমধ্যে দুজন আছেন');
  res.json({ id: b.id });
}));

r.get('/battles/:id', asyncH(async (req, res) => {
  let b = await one('SELECT * FROM battles WHERE id=?', [req.params.id]);
  if (!b || ![b.creator_id, b.opponent_id].includes(req.user.id)) throw new HttpError(404, 'ব্যাটল পাওয়া যায়নি');
  b = await finishIfDone(b);
  res.json(await battleView(b, req.user.id));
}));

r.post('/battles/:id/answer', asyncH(async (req, res) => {
  let b = await one('SELECT * FROM battles WHERE id=?', [req.params.id]);
  if (!b || ![b.creator_id, b.opponent_id].includes(req.user.id)) throw new HttpError(404, 'ব্যাটল পাওয়া যায়নি');
  if (b.status !== 'active') throw new HttpError(400, 'ব্যাটল চলমান নেই');
  const q = await one('SELECT q.correct_option FROM test_questions tq JOIN questions q ON q.id=tq.question_id WHERE tq.test_id=? AND q.id=?', [b.test_id, req.body.question_id]);
  if (!q) throw new HttpError(400, 'অবৈধ প্রশ্ন');
  const sel = ['a', 'b', 'c', 'd'].includes(req.body.selected) ? req.body.selected : null;
  const time = clamp(Number(req.body.time_ms) || 0, 0, b.per_question_sec * 1000 + 2000);
  // First answer counts — no changing answers after seeing the opponent's progress.
  await query('INSERT IGNORE INTO battle_answers (battle_id, user_id, question_id, selected, is_correct, time_ms) VALUES (?,?,?,?,?,?)',
    [b.id, req.user.id, req.body.question_id, sel, sel === q.correct_option ? 1 : 0, time]);
  b = await finishIfDone(b);
  res.json({ ok: true, status: b.status });
}));

r.get('/battles', asyncH(async (req, res) => {
  const rows = await query(
    `SELECT b.id, b.code, b.status, b.created_at, b.creator_id, b.opponent_id, uc.name creator, uo.name opponent,
            (SELECT SUM(is_correct) FROM battle_answers x WHERE x.battle_id=b.id AND x.user_id=?) my_correct,
            (SELECT SUM(is_correct) FROM battle_answers x WHERE x.battle_id=b.id AND x.user_id<>?) their_correct
       FROM battles b JOIN users uc ON uc.id=b.creator_id LEFT JOIN users uo ON uo.id=b.opponent_id
      WHERE b.creator_id=? OR b.opponent_id=? ORDER BY b.id DESC LIMIT 30`, [req.user.id, req.user.id, req.user.id, req.user.id]);
  const s = rows.filter((x) => x.status === 'finished');
  res.json({ rows, record: { played: s.length, won: s.filter((x) => Number(x.my_correct) > Number(x.their_correct)).length } });
}));

// ================= Study groups & coaching batches =================
async function membership(groupId, userId) {
  return one('SELECT g.*, m.role FROM study_groups g LEFT JOIN group_members m ON m.group_id=g.id AND m.user_id=? WHERE g.id=?', [userId, groupId]);
}
const isStaff = (m) => m?.role === 'owner' || m?.role === 'teacher';

r.get('/groups', asyncH(async (req, res) => {
  const mine = await query(
    `SELECT g.*, m.role, (SELECT COUNT(*) FROM group_members x WHERE x.group_id=g.id) members, e.name_bn exam
       FROM group_members m JOIN study_groups g ON g.id=m.group_id LEFT JOIN exams e ON e.id=g.exam_id
      WHERE m.user_id=? ORDER BY g.id DESC`, [req.user.id]);
  const suggested = await query(
    `SELECT g.id, g.name, g.description, g.code, e.name_bn exam, (SELECT COUNT(*) FROM group_members x WHERE x.group_id=g.id) members
       FROM study_groups g LEFT JOIN exams e ON e.id=g.exam_id
      WHERE g.is_public=1 AND g.kind='group' AND (g.exam_id=? OR g.exam_id IS NULL)
        AND NOT EXISTS (SELECT 1 FROM group_members m WHERE m.group_id=g.id AND m.user_id=?)
      ORDER BY members DESC LIMIT 10`, [req.user.target_exam_id, req.user.id]);
  res.json({ mine, suggested });
}));

r.post('/groups', asyncH(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (name.length < 3) throw new HttpError(400, 'গ্রুপের নাম দিন');
  const kind = req.body.kind === 'batch' ? 'batch' : 'group';
  if (kind === 'batch' && !['teacher', 'admin'].includes(req.user.role)) throw new HttpError(403, 'কোচিং ব্যাচ শুধু শিক্ষক অ্যাকাউন্ট থেকে খোলা যায়');
  const count = await one('SELECT COUNT(*) n FROM study_groups WHERE owner_id=?', [req.user.id]);
  if (count.n >= 20) throw new HttpError(429, 'সর্বোচ্চ ২০টি গ্রুপ খোলা যায়');
  const code = newCode();
  const ins = await query('INSERT INTO study_groups (kind, name, description, code, owner_id, exam_id, is_public) VALUES (?,?,?,?,?,?,?)',
    [kind, name.slice(0, 120), req.body.description?.slice(0, 500) || null, code, req.user.id, req.body.exam_id || req.user.target_exam_id || null, kind === 'group' && req.body.is_public ? 1 : 0]);
  await query('INSERT INTO group_members (group_id, user_id, role) VALUES (?,?,?)', [ins.insertId, req.user.id, 'owner']);
  res.json({ id: ins.insertId, code });
}));

r.post('/groups/join/:code', asyncH(async (req, res) => {
  const g = await one('SELECT * FROM study_groups WHERE code=?', [req.params.code.toUpperCase()]);
  if (!g) throw new HttpError(404, 'গ্রুপ পাওয়া যায়নি — কোডটি আবার দেখুন');
  const n = await one('SELECT COUNT(*) n FROM group_members WHERE group_id=?', [g.id]);
  if (n.n >= (g.kind === 'batch' ? 500 : 200)) throw new HttpError(409, 'গ্রুপটি পূর্ণ');
  await query('INSERT IGNORE INTO group_members (group_id, user_id, role) VALUES (?,?,?)', [g.id, req.user.id, 'member']);
  res.json({ id: g.id });
}));

r.post('/groups/:id/leave', asyncH(async (req, res) => {
  const m = await membership(req.params.id, req.user.id);
  if (m?.role === 'owner') throw new HttpError(400, 'মালিক গ্রুপ ছাড়তে পারবেন না — প্রয়োজনে গ্রুপ মুছুন');
  await query('DELETE FROM group_members WHERE group_id=? AND user_id=?', [req.params.id, req.user.id]);
  res.json({ ok: true });
}));

r.get('/groups/:id', asyncH(async (req, res) => {
  const g = await membership(req.params.id, req.user.id);
  if (!g || !g.role) throw new HttpError(404, 'গ্রুপ পাওয়া যায়নি');
  const staff = isStaff(g);
  const members = await query(
    `SELECT u.id, u.name, u.district, u.streak, m.role,
            COALESCE(SUM(CASE WHEN a.submitted_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY THEN a.xp_earned END),0) week_xp,
            ROUND(100*SUM(CASE WHEN a.submitted_at >= UTC_TIMESTAMP() - INTERVAL 30 DAY THEN a.correct END)/
                  NULLIF(SUM(CASE WHEN a.submitted_at >= UTC_TIMESTAMP() - INTERVAL 30 DAY THEN a.correct+a.wrong END),0)) accuracy,
            MAX(a.submitted_at) last_active
       FROM group_members m JOIN users u ON u.id=m.user_id LEFT JOIN attempts a ON a.user_id=u.id AND a.status='submitted' AND a.flagged=0
      WHERE m.group_id=? GROUP BY u.id, m.role ORDER BY week_xp DESC`, [g.id]);
  const posts = await query(
    `SELECT p.id, p.body, p.created_at, u.name, p.user_id, m.role FROM group_posts p JOIN users u ON u.id=p.user_id
       LEFT JOIN group_members m ON m.group_id=p.group_id AND m.user_id=p.user_id WHERE p.group_id=? ORDER BY p.id DESC LIMIT 50`, [g.id]);
  const assignments = await query(
    `SELECT ga.id, ga.title, ga.due_at, ga.test_id, ga.created_at,
            (SELECT COUNT(*) FROM test_questions tq WHERE tq.test_id=ga.test_id) questions,
            (SELECT COUNT(DISTINCT a.user_id) FROM attempts a JOIN group_members gm ON gm.user_id=a.user_id AND gm.group_id=ga.group_id
              WHERE a.test_id=ga.test_id AND a.status='submitted') done,
            (SELECT a.id FROM attempts a WHERE a.test_id=ga.test_id AND a.user_id=? AND a.status='submitted' ORDER BY a.id LIMIT 1) my_attempt,
            (SELECT ROUND(AVG(a.score),1) FROM attempts a WHERE a.test_id=ga.test_id AND a.status='submitted') avg_score
       FROM group_assignments ga WHERE ga.group_id=? ORDER BY ga.id DESC`, [req.user.id, g.id]);
  res.json({
    id: g.id, kind: g.kind, name: g.name, description: g.description, code: g.code, role: g.role, is_public: !!g.is_public,
    members: members.map((m) => ({ ...m, week_xp: Number(m.week_xp), ...(staff || m.id === req.user.id ? {} : { accuracy: undefined }) })),
    posts, assignments, can_assign: staff,
  });
}));

r.post('/groups/:id/posts', asyncH(async (req, res) => {
  const g = await membership(req.params.id, req.user.id);
  if (!g?.role) throw new HttpError(404, 'গ্রুপ পাওয়া যায়নি');
  const body = String(req.body.body || '').trim();
  if (body.length < 2) throw new HttpError(400, 'কিছু লিখুন');
  if (g.kind === 'batch' && !isStaff(g) && req.body.announce) throw new HttpError(403, 'অনুমতি নেই');
  await query('INSERT INTO group_posts (group_id, user_id, body) VALUES (?,?,?)', [g.id, req.user.id, body.slice(0, 2000)]);
  res.json({ ok: true });
}));

r.delete('/groups/:id/posts/:postId', asyncH(async (req, res) => {
  const g = await membership(req.params.id, req.user.id);
  await query('DELETE FROM group_posts WHERE id=? AND group_id=? AND (user_id=? OR ?)', [req.params.postId, req.params.id, req.user.id, isStaff(g) ? 1 : 0]);
  res.json({ ok: true });
}));

// Group challenge / batch assignment: one shared test every member takes; ranked within the group.
r.post('/groups/:id/assignments', asyncH(async (req, res) => {
  const g = await membership(req.params.id, req.user.id);
  if (!g?.role) throw new HttpError(404, 'গ্রুপ পাওয়া যায়নি');
  if (g.kind === 'batch' && !isStaff(g)) throw new HttpError(403, 'শুধু শিক্ষক অ্যাসাইনমেন্ট দিতে পারেন');
  const count = clamp(Number(req.body.count) || 20, 5, 100);
  const exam = g.exam_id ? await one('SELECT * FROM exams WHERE id=?', [g.exam_id]) : await getUserExam(req.user);
  let ids;
  if (req.body.topic_ids?.length) ids = (await query(`SELECT id FROM questions WHERE topic_id IN (?) AND status='active' ORDER BY RAND() LIMIT ?`, [req.body.topic_ids, count])).map((x) => x.id);
  else if (req.body.subject_id) ids = (await query(`SELECT id FROM questions WHERE subject_id=? AND status='active' ORDER BY RAND() LIMIT ?`, [req.body.subject_id, count])).map((x) => x.id);
  else ids = await pickMock(req.user.id, exam, count);
  if (!ids.length) throw new HttpError(404, 'প্রশ্ন পাওয়া যায়নি');
  const title = String(req.body.title || '').trim() || `${g.name} — ${g.kind === 'batch' ? 'অ্যাসাইনমেন্ট' : 'গ্রুপ চ্যালেঞ্জ'}`;
  const testId = await createTest({ title, kind: 'challenge', track: exam?.track, examId: exam?.id, questionIds: ids,
    durationSec: ids.length * (exam?.sec_per_question || 40), negativeMark: Number(exam?.negative_mark || 0), meta: { group_id: g.id }, userId: req.user.id });
  const ins = await query('INSERT INTO group_assignments (group_id, test_id, title, due_at, created_by) VALUES (?,?,?,?,?)',
    [g.id, testId, title.slice(0, 200), req.body.due_at ? new Date(req.body.due_at).toISOString().slice(0, 19).replace('T', ' ') : null, req.user.id]);
  await query('INSERT INTO group_posts (group_id, user_id, body) VALUES (?,?,?)', [g.id, req.user.id, `📝 নতুন ${g.kind === 'batch' ? 'অ্যাসাইনমেন্ট' : 'গ্রুপ চ্যালেঞ্জ'}: ${title} (${ids.length} প্রশ্ন)`]);
  res.json({ id: ins.insertId, test_id: testId });
}));

r.get('/groups/:id/assignments/:aid', asyncH(async (req, res) => {
  const g = await membership(req.params.id, req.user.id);
  if (!g?.role) throw new HttpError(404, 'গ্রুপ পাওয়া যায়নি');
  const a = await one('SELECT * FROM group_assignments WHERE id=? AND group_id=?', [req.params.aid, g.id]);
  if (!a) throw new HttpError(404, 'অ্যাসাইনমেন্ট পাওয়া যায়নি');
  const rows = await query(
    `SELECT u.id, u.name, m.role, a.id attempt_id, a.score, a.correct, a.wrong, a.time_spent_sec, a.submitted_at
       FROM group_members m JOIN users u ON u.id=m.user_id
       LEFT JOIN attempts a ON a.id=(SELECT MIN(x.id) FROM attempts x WHERE x.user_id=u.id AND x.test_id=? AND x.status='submitted')
      WHERE m.group_id=? ORDER BY a.score IS NULL, a.score DESC, a.time_spent_sec ASC`, [a.test_id, g.id]);
  const staff = isStaff(g);
  // Weakest questions for the class (teacher view).
  const hard = staff ? await query(
    `SELECT q.id, LEFT(q.body, 120) body, COUNT(*) n, ROUND(100*SUM(aa.is_correct)/COUNT(*)) accuracy
       FROM attempt_answers aa JOIN attempts at ON at.id=aa.attempt_id AND at.test_id=? JOIN group_members m ON m.user_id=aa.user_id AND m.group_id=?
       JOIN questions q ON q.id=aa.question_id GROUP BY q.id ORDER BY accuracy ASC LIMIT 5`, [a.test_id, g.id]) : [];
  res.json({ ...a, rows: rows.map((x) => ({ ...x, score: x.score == null ? null : Number(x.score) })), hardest: hard, staff });
}));

// ================= Referrals =================
r.get('/referral', asyncH(async (req, res) => {
  let code = req.user.referral_code;
  if (!code) {
    code = newCode();
    await query('UPDATE users SET referral_code=? WHERE id=? AND referral_code IS NULL', [code, req.user.id]);
    code = (await one('SELECT referral_code FROM users WHERE id=?', [req.user.id])).referral_code;
  }
  const stats = await one('SELECT COUNT(*) joined, SUM(referral_rewarded) rewarded FROM users WHERE referred_by=?', [req.user.id]);
  res.json({ code, joined: stats.joined, rewarded: Number(stats.rewarded || 0) });
}));

export default r;
