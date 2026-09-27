// Public quiz API (no login) — the top of the growth funnel. Only active, non-product questions,
// at most 10 per request, answers revealed only after submission, scores computed server-side.
import { Router } from 'express';
import crypto from 'node:crypto';
import { query, one } from '../db.js';
import { asyncH, HttpError, dhakaToday, pct } from '../services/util.js';

const r = Router();
const TRACKS = ['job', 'admission', 'academic'];
const N = 10;

// ---- Tiny per-IP rate limit (in-memory; fine for a single server) ----
const hits = new Map();
r.use((req, res, next) => {
  const ip = req.ip || 'x';
  const now = Date.now();
  const h = hits.get(ip)?.filter((t) => now - t < 60000) || [];
  h.push(now); hits.set(ip, h);
  if (h.length > 90) return res.status(429).json({ error: 'অনেক বেশি অনুরোধ — এক মিনিট পর চেষ্টা করুন' });
  next();
});
const ipHash = (req) => crypto.createHash('sha256').update(`${req.ip}|${process.env.JWT_SECRET}`).digest('hex');
const track = (t) => (TRACKS.includes(t) ? t : 'job');

// Deterministic pseudo-random order so "today's quiz" is identical for everyone.
function seededPick(ids, seed, n) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = () => ((h = (h * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

const publicQ = (rows) => rows.map((q) => ({
  id: q.id, body: q.body, subject: q.subject, topic: q.topic,
  options: { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d },
}));

async function loadQuestions(ids) {
  if (!ids.length) return [];
  const rows = await query(
    `SELECT q.*, s.name_bn subject, t.name_bn topic FROM questions q JOIN subjects s ON s.id=q.subject_id JOIN topics t ON t.id=q.topic_id
      WHERE q.id IN (?) AND q.status='active'`, [ids]);
  const byId = new Map(rows.map((x) => [x.id, x]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

async function dailyIds(t, date = dhakaToday()) {
  const pool = (await query(`SELECT q.id FROM questions q JOIN subjects s ON s.id=q.subject_id WHERE q.status='active' AND s.track=? ORDER BY q.id`, [t])).map((x) => x.id);
  return seededPick(pool, `${date}|${t}`, N);
}

r.get('/tracks', asyncH(async (_req, res) => {
  const subjects = await query(
    `SELECT s.id, s.track, s.name_bn, COUNT(q.id) questions FROM subjects s JOIN questions q ON q.subject_id=s.id AND q.status='active'
      GROUP BY s.id HAVING questions >= 5 ORDER BY s.id`);
  res.json(TRACKS.map((t) => ({ track: t, subjects: subjects.filter((s) => s.track === t) })));
}));

r.get('/daily', asyncH(async (req, res) => {
  const t = track(req.query.track);
  const date = dhakaToday();
  const qs = await loadQuestions(await dailyIds(t, date));
  const plays = await one(`SELECT COUNT(*) n FROM public_plays WHERE quiz_key=?`, [`daily:${t}:${date}`]);
  res.json({ kind: 'daily', key: `daily:${t}:${date}`, title: 'আজকের কুইজ', track: t, date, players: plays.n, questions: publicQ(qs) });
}));

r.get('/subject/:id', asyncH(async (req, res) => {
  const s = await one('SELECT id, name_bn, track FROM subjects WHERE id=?', [req.params.id]);
  if (!s) throw new HttpError(404, 'বিষয় পাওয়া যায়নি');
  const ids = (await query(`SELECT id FROM questions WHERE subject_id=? AND status='active' ORDER BY RAND() LIMIT ?`, [s.id, N])).map((x) => x.id);
  res.json({ kind: 'subject', key: `subject:${s.id}`, title: `${s.name_bn} কুইজ`, track: s.track, questions: publicQ(await loadQuestions(ids)) });
}));

// ---- Question of the day ----
async function qotd(t, date = dhakaToday()) {
  const [id] = seededPick((await query(`SELECT q.id FROM questions q JOIN subjects s ON s.id=q.subject_id WHERE q.status='active' AND s.track=?`, [t])).map((x) => x.id), `qotd|${date}|${t}`, 1);
  return id ? (await loadQuestions([id]))[0] : null;
}
async function qotdStats(t, date) {
  const s = await one('SELECT COUNT(*) n, SUM(is_correct) c FROM public_qotd_answers WHERE qotd_date=? AND track=?', [date, t]);
  return { answered: s.n, correct_pct: s.n >= 5 ? pct(Number(s.c), s.n) : null };
}

r.get('/qotd', asyncH(async (req, res) => {
  const t = track(req.query.track); const date = dhakaToday();
  const q = await qotd(t, date);
  if (!q) return res.json(null);
  res.json({ date, track: t, question: publicQ([q])[0], stats: await qotdStats(t, date) });
}));

r.post('/qotd/answer', asyncH(async (req, res) => {
  const t = track(req.body.track); const date = dhakaToday();
  const q = await qotd(t, date);
  if (!q || q.id !== Number(req.body.question_id)) throw new HttpError(400, 'আজকের প্রশ্ন বদলে গেছে — পাতাটি রিফ্রেশ করুন');
  const correct = req.body.selected === q.correct_option;
  await query('INSERT INTO public_qotd_answers (qotd_date, track, question_id, is_correct) VALUES (?,?,?,?)', [date, t, q.id, correct ? 1 : 0]);
  res.json({ correct: q.correct_option, is_correct: correct, explanation: q.explanation, stats: await qotdStats(t, date) });
}));

// ---- Submit a quiz: server recomputes the score ----
const cleanNick = (s) => String(s || '').replace(/https?:\/\/\S+|www\.\S+/gi, '').replace(/[<>]/g, '').trim().slice(0, 30) || null;

r.post('/submit', asyncH(async (req, res) => {
  const { kind, key, answers = {}, nickname } = req.body;
  if (!['daily', 'subject', 'challenge'].includes(kind)) throw new HttpError(400, 'অবৈধ কুইজ');
  let ids = (req.body.question_ids || []).map(Number).filter(Boolean).slice(0, N);
  let t = null;
  // Daily and challenge sets are authoritative on the server; the client can't swap questions.
  if (kind === 'daily') {
    const [, tr, date] = String(key).split(':');
    if (date !== dhakaToday()) throw new HttpError(400, 'দিন বদলে গেছে — আজকের নতুন কুইজ খেলুন');
    t = track(tr); ids = await dailyIds(t, date);
  } else if (kind === 'challenge') {
    const c = await one('SELECT question_ids, track FROM public_plays WHERE challenge_code=?', [String(key).split(':')[1]]);
    if (!c) throw new HttpError(404, 'চ্যালেঞ্জ পাওয়া যায়নি');
    ids = JSON.parse(typeof c.question_ids === 'string' ? c.question_ids : JSON.stringify(c.question_ids)); t = c.track;
  }
  const qs = await loadQuestions(ids);
  if (!qs.length) throw new HttpError(400, 'প্রশ্ন পাওয়া যায়নি');
  t ||= (await one('SELECT s.track FROM subjects s WHERE s.id=?', [qs[0].subject_id]))?.track || null;
  const review = qs.map((q) => ({
    id: q.id, body: q.body, subject: q.subject, options: { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d },
    selected: ['a', 'b', 'c', 'd'].includes(answers[q.id]) ? answers[q.id] : null, correct: q.correct_option, explanation: q.explanation,
  }));
  const score = review.filter((x) => x.selected === x.correct).length;
  const timeSec = Math.max(0, Math.min(Number(req.body.time_sec) || 0, 3600));
  const quizKey = kind === 'subject' ? `subject:${qs[0].subject_id}:${dhakaToday()}` : String(key).slice(0, 60);
  const code = crypto.randomBytes(4).toString('base64url').replace(/[-_]/g, 'x').slice(0, 6).toUpperCase();
  const ins = await query(
    `INSERT INTO public_plays (kind, quiz_key, track, question_ids, score, total, time_sec, nickname, challenge_code, ip_hash) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [kind, quizKey, t, JSON.stringify(qs.map((q) => q.id)), score, qs.length, timeSec, cleanNick(nickname), code, ipHash(req)]);
  // Percentile only when enough people played the same quiz — otherwise it would mislead.
  const others = await query('SELECT score, time_sec FROM public_plays WHERE quiz_key=? AND id<>?', [quizKey, ins.insertId]);
  const beat = others.filter((o) => o.score < score || (o.score === score && o.time_sec > timeSec)).length;
  res.json({
    play_id: ins.insertId, score, total: qs.length, time_sec: timeSec, challenge_code: code, review,
    players: others.length + 1, percentile: others.length >= 4 ? pct(beat, others.length) : null,
  });
}));

r.post('/plays/:id/nickname', asyncH(async (req, res) => {
  // Only the same device/IP that played can name the result.
  await query('UPDATE public_plays SET nickname=? WHERE id=? AND ip_hash=? AND created_at >= UTC_TIMESTAMP() - INTERVAL 1 DAY',
    [cleanNick(req.body.nickname), req.params.id, ipHash(req)]);
  res.json({ ok: true });
}));

r.get('/challenge/:code', asyncH(async (req, res) => {
  const c = await one('SELECT * FROM public_plays WHERE challenge_code=?', [req.params.code.toUpperCase()]);
  if (!c) throw new HttpError(404, 'চ্যালেঞ্জ পাওয়া যায়নি — লিংকটি আবার দেখুন');
  const ids = typeof c.question_ids === 'string' ? JSON.parse(c.question_ids) : c.question_ids;
  res.json({
    kind: 'challenge', key: `challenge:${c.challenge_code}`, title: 'বন্ধুর চ্যালেঞ্জ', track: c.track,
    challenger: { name: c.nickname || 'আপনার বন্ধু', score: c.score, total: c.total, time_sec: c.time_sec },
    questions: publicQ(await loadQuestions(ids)),
  });
}));

r.get('/board', asyncH(async (req, res) => {
  const t = track(req.query.track);
  const rows = await query(
    `SELECT nickname, score, total, time_sec FROM public_plays WHERE quiz_key=? AND nickname IS NOT NULL ORDER BY score DESC, time_sec ASC LIMIT 20`,
    [`daily:${t}:${dhakaToday()}`]);
  res.json(rows);
}));

export default r;
