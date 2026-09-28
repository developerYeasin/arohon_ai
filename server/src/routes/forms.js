// Link exams: staff build a Google-Form-style exam in the quiz app, publish it and share a link;
// anyone with the link enters a name and sits the exam (timer, negative marking, instant result).
import { Router } from 'express';
import crypto from 'node:crypto';
import { query, one } from '../db.js';
import { auth, requireRole } from '../middleware/auth.js';
import { asyncH, HttpError, parseJson, shuffle } from '../services/util.js';

const r = Router();
const staff = [auth, requireRole('admin', 'teacher')];
const ipHash = (req) => crypto.createHash('sha256').update(`${req.ip}|${process.env.JWT_SECRET}`).digest('hex');
const newCode = () => crypto.randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').slice(0, 7);
const toSql = (v) => (v ? new Date(v).toISOString().slice(0, 19).replace('T', ' ') : null);
const asUtc = (v) => (!v ? null : v instanceof Date ? v : new Date(String(v).replace(' ', 'T') + (String(v).endsWith('Z') ? '' : 'Z')));
const num = (v, d = 0) => (v === '' || v == null || Number.isNaN(Number(v)) ? d : Number(v));
const BN = { '০': 0, '১': 1, '২': 2, '৩': 3, '৪': 4, '৫': 5, '৬': 6, '৭': 7, '৮': 8, '৯': 9 };
const norm = (s) => String(s ?? '').replace(/[০-৯]/g, (d) => BN[d]).trim().toLowerCase().replace(/\s+/g, ' ').replace(/[।.,!?;:'"]+$/g, '');
const nameKey = (s) => norm(s).slice(0, 80);

const SETTINGS = ['title', 'description', 'status', 'duration_min', 'marks_per_q', 'negative_mark', 'pass_mark', 'shuffle_questions', 'shuffle_options',
  'one_attempt', 'show_result', 'show_answers', 'show_leaderboard', 'password', 'starts_at', 'ends_at'];

function cleanSettings(b) {
  const out = {};
  for (const k of SETTINGS) {
    if (!(k in b)) continue;
    let v = b[k];
    if (['duration_min'].includes(k)) v = Math.max(0, Math.min(600, Math.round(num(v))));
    else if (['marks_per_q', 'negative_mark'].includes(k)) v = Math.max(0, num(v));
    else if (k === 'pass_mark') v = v === '' || v == null ? null : num(v);
    else if (k.startsWith('shuffle_') || k.startsWith('show_') && k !== 'show_result' || k === 'one_attempt') v = v ? 1 : 0;
    else if (k === 'show_result') v = ['immediate', 'after_end', 'never'].includes(v) ? v : 'immediate';
    else if (k === 'status') v = ['draft', 'live', 'closed'].includes(v) ? v : 'draft';
    else if (k === 'starts_at' || k === 'ends_at') v = toSql(v);
    else if (k === 'password') v = String(v || '').trim().slice(0, 60) || null;
    else if (k === 'title') { v = String(v || '').trim().slice(0, 200); if (!v) throw new HttpError(400, 'পরীক্ষার নাম দিন'); }
    else v = v == null ? null : String(v);
    out[k] = v;
  }
  return out;
}

function cleanQuestion(b) {
  const type = ['single', 'multi', 'text'].includes(b.type) ? b.type : 'single';
  const body = String(b.body || '').trim();
  if (!body && !b.image) throw new HttpError(400, 'প্রশ্ন লিখুন');
  if (b.image && String(b.image).length > 3_000_000) throw new HttpError(400, 'ছবি অনেক বড় — ছোট ছবি দিন');
  let options = null, answer;
  if (type === 'text') {
    answer = (Array.isArray(b.answer) ? b.answer : String(b.answer || '').split('|')).map((s) => String(s).trim()).filter(Boolean);
    if (!answer.length) throw new HttpError(400, 'অন্তত একটি সঠিক উত্তর লিখুন');
  } else {
    options = (b.options || []).map((o, i) => ({ id: o.id || 'abcdefgh'[i], text: String(o.text || '').trim(), image: o.image || null }))
      .filter((o) => o.text || o.image);
    if (options.length < 2) throw new HttpError(400, 'অন্তত ২টি অপশন দিন');
    if (options.some((o) => o.image && o.image.length > 1_500_000)) throw new HttpError(400, 'অপশনের ছবি অনেক বড়');
    const ids = new Set(options.map((o) => o.id));
    answer = [...new Set((b.answer || []).filter((a) => ids.has(a)))];
    if (!answer.length) throw new HttpError(400, 'সঠিক উত্তর বেছে দিন');
    if (type === 'single') answer = answer.slice(0, 1);
  }
  return {
    type, body, image: b.image || null, options: options && JSON.stringify(options), answer: JSON.stringify(answer),
    marks: b.marks === '' || b.marks == null ? null : Math.max(0, num(b.marks)), explanation: String(b.explanation || '').trim() || null,
  };
}

const parseQ = (q) => ({ ...q, options: parseJson(q.options, null), answer: parseJson(q.answer, []), marks: q.marks == null ? null : Number(q.marks) });

async function ownForm(req, id) {
  const f = await one('SELECT * FROM exam_forms WHERE id=?', [id]);
  if (!f || (req.user.role !== 'admin' && f.owner_id !== req.user.id)) throw new HttpError(404, 'পরীক্ষা পাওয়া যায়নি');
  return f;
}

function grade(q, given, form) {
  const marks = q.marks ?? Number(form.marks_per_q);
  const empty = given == null || (Array.isArray(given) ? !given.length : !String(given).trim());
  if (empty) return { state: 'skipped', got: 0, marks };
  let ok;
  if (q.type === 'text') ok = q.answer.some((a) => norm(a) === norm(given));
  else {
    const g = [...new Set([].concat(given))].sort();
    ok = g.length === q.answer.length && [...q.answer].sort().every((a, i) => a === g[i]);
  }
  return { state: ok ? 'correct' : 'wrong', got: ok ? marks : -Number(form.negative_mark), marks };
}

function scoreAll(qs, answers, form) {
  let score = 0, total = 0, correct = 0, wrong = 0, skipped = 0;
  const detail = {};
  for (const q of qs) {
    const g = grade(q, answers?.[q.id], form);
    detail[q.id] = g; total += g.marks; score += g.got;
    if (g.state === 'correct') correct++; else if (g.state === 'wrong') wrong++; else skipped++;
  }
  return { score: Math.round(score * 100) / 100, total: Math.round(total * 100) / 100, correct, wrong, skipped, detail };
}

// ================= staff =================
r.get('/mine', ...staff, asyncH(async (req, res) => {
  const mine = req.user.role === 'admin' && req.query.all ? '' : 'WHERE f.owner_id=?';
  res.json(await query(
    `SELECT f.id, f.code, f.title, f.status, f.duration_min, f.starts_at, f.ends_at, f.updated_at, u.name owner,
      (SELECT COUNT(*) FROM exam_form_questions q WHERE q.form_id=f.id) questions,
      (SELECT COUNT(*) FROM exam_form_submissions s WHERE s.form_id=f.id AND s.status='submitted') submissions
     FROM exam_forms f JOIN users u ON u.id=f.owner_id ${mine} ORDER BY f.updated_at DESC`, mine ? [req.user.id] : []));
}));

r.post('/', ...staff, asyncH(async (req, res) => {
  const s = cleanSettings({ title: req.body.title || 'নতুন পরীক্ষা', ...req.body });
  const ins = await query('INSERT INTO exam_forms SET ?', [{ ...s, owner_id: req.user.id, code: newCode() }]);
  res.status(201).json({ id: ins.insertId });
}));

r.get('/:id', ...staff, asyncH(async (req, res) => {
  const f = await ownForm(req, req.params.id);
  const qs = (await query('SELECT * FROM exam_form_questions WHERE form_id=? ORDER BY position, id', [f.id])).map(parseQ);
  const subs = await one("SELECT COUNT(*) n FROM exam_form_submissions WHERE form_id=? AND status='submitted'", [f.id]);
  res.json({ ...f, questions: qs, submissions: subs.n });
}));

r.put('/:id', ...staff, asyncH(async (req, res) => {
  const f = await ownForm(req, req.params.id);
  const s = cleanSettings(req.body);
  if (s.status === 'live') {
    const c = await one('SELECT COUNT(*) n FROM exam_form_questions WHERE form_id=?', [f.id]);
    if (!c.n) throw new HttpError(400, 'প্রকাশের আগে অন্তত একটি প্রশ্ন যোগ করুন');
  }
  if (Object.keys(s).length) await query('UPDATE exam_forms SET ? WHERE id=?', [s, f.id]);
  res.json(await one('SELECT * FROM exam_forms WHERE id=?', [f.id]));
}));

r.delete('/:id', ...staff, asyncH(async (req, res) => {
  const f = await ownForm(req, req.params.id);
  await query('DELETE FROM exam_forms WHERE id=?', [f.id]);
  res.json({ ok: true });
}));

r.post('/:id/duplicate', ...staff, asyncH(async (req, res) => {
  const f = await ownForm(req, req.params.id);
  const { id, code, created_at, updated_at, owner_id, ...rest } = f;
  const ins = await query('INSERT INTO exam_forms SET ?', [{ ...rest, title: `${f.title} (কপি)`, status: 'draft', owner_id: req.user.id, code: newCode() }]);
  await query(`INSERT INTO exam_form_questions (form_id, position, type, body, image, options, answer, marks, explanation)
    SELECT ?, position, type, body, image, options, answer, marks, explanation FROM exam_form_questions WHERE form_id=?`, [ins.insertId, f.id]);
  res.status(201).json({ id: ins.insertId });
}));

r.post('/:id/questions', ...staff, asyncH(async (req, res) => {
  const f = await ownForm(req, req.params.id);
  const list = Array.isArray(req.body.questions) ? req.body.questions : [req.body];
  const clean = list.map(cleanQuestion);
  const max = await one('SELECT COALESCE(MAX(position),0) p FROM exam_form_questions WHERE form_id=?', [f.id]);
  const ids = [];
  for (const [i, q] of clean.entries()) ids.push((await query('INSERT INTO exam_form_questions SET ?', [{ ...q, form_id: f.id, position: max.p + i + 1 }])).insertId);
  await query('UPDATE exam_forms SET updated_at=NOW() WHERE id=?', [f.id]);
  const rows = (await query('SELECT * FROM exam_form_questions WHERE id IN (?) ORDER BY position', [ids])).map(parseQ);
  res.status(201).json(Array.isArray(req.body.questions) ? rows : rows[0]);
}));

r.put('/:id/questions/:qid', ...staff, asyncH(async (req, res) => {
  const f = await ownForm(req, req.params.id);
  await query('UPDATE exam_form_questions SET ? WHERE id=? AND form_id=?', [cleanQuestion(req.body), req.params.qid, f.id]);
  res.json(parseQ(await one('SELECT * FROM exam_form_questions WHERE id=?', [req.params.qid])));
}));

r.delete('/:id/questions/:qid', ...staff, asyncH(async (req, res) => {
  const f = await ownForm(req, req.params.id);
  await query('DELETE FROM exam_form_questions WHERE id=? AND form_id=?', [req.params.qid, f.id]);
  res.json({ ok: true });
}));

r.post('/:id/reorder', ...staff, asyncH(async (req, res) => {
  const f = await ownForm(req, req.params.id);
  for (const [i, qid] of (req.body.ids || []).entries()) await query('UPDATE exam_form_questions SET position=? WHERE id=? AND form_id=?', [i + 1, qid, f.id]);
  res.json({ ok: true });
}));

r.get('/:id/results', ...staff, asyncH(async (req, res) => {
  const f = await ownForm(req, req.params.id);
  await closeExpired(f);
  const qs = (await query('SELECT id, type, body, options, answer, marks FROM exam_form_questions WHERE form_id=? ORDER BY position, id', [f.id])).map(parseQ);
  const subs = await query(
    `SELECT id, name, status, started_at, submitted_at, time_sec, score, total_marks, correct, wrong, skipped, answers
     FROM exam_form_submissions WHERE form_id=? ORDER BY status='submitted' DESC, score DESC, time_sec ASC`, [f.id]);
  const done = subs.filter((s) => s.status === 'submitted');
  const stats = qs.map((q) => {
    const st = { id: q.id, body: q.body, type: q.type, correct: 0, wrong: 0, skipped: 0, picks: {} };
    for (const s of done) {
      const given = parseJson(s.answers, {})?.[q.id];
      st[grade(q, given, f).state]++;
      if (q.type !== 'text') for (const g of [].concat(given ?? [])) st.picks[g] = (st.picks[g] || 0) + 1;
    }
    return { ...st, options: q.options, answer: q.answer };
  });
  const scores = done.map((s) => Number(s.score));
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  res.json({
    summary: {
      submitted: done.length, in_progress: subs.length - done.length, avg: Math.round(avg * 100) / 100,
      highest: scores.length ? Math.max(...scores) : 0, lowest: scores.length ? Math.min(...scores) : 0,
      passed: f.pass_mark == null ? null : scores.filter((x) => x >= Number(f.pass_mark)).length,
    },
    submissions: subs.map(({ answers, ...s }) => ({ ...s, score: s.score == null ? null : Number(s.score), total_marks: s.total_marks == null ? null : Number(s.total_marks) })), stats,
  });
}));

r.get('/:id/submissions/:sid', ...staff, asyncH(async (req, res) => {
  const f = await ownForm(req, req.params.id);
  const s = await one('SELECT * FROM exam_form_submissions WHERE id=? AND form_id=?', [req.params.sid, f.id]);
  if (!s) throw new HttpError(404, 'পাওয়া যায়নি');
  const qs = (await query('SELECT * FROM exam_form_questions WHERE form_id=? ORDER BY position, id', [f.id])).map(parseQ);
  const answers = parseJson(s.answers, {}) || {};
  res.json({ ...s, answers, questions: qs.map((q) => ({ ...q, given: answers[q.id] ?? null, result: grade(q, answers[q.id], f) })) });
}));

r.delete('/:id/submissions/:sid', ...staff, asyncH(async (req, res) => {
  const f = await ownForm(req, req.params.id);
  await query('DELETE FROM exam_form_submissions WHERE id=? AND form_id=?', [req.params.sid, f.id]);
  res.json({ ok: true });
}));

// ================= public (exam link) =================
async function liveForm(code) {
  const f = await one('SELECT * FROM exam_forms WHERE code=?', [code]);
  if (!f || f.status === 'draft') throw new HttpError(404, 'এই লিংকে কোনো পরীক্ষা নেই');
  return f;
}

function windowState(f, now = new Date()) {
  if (f.status === 'closed') return 'closed';
  const s = asUtc(f.starts_at), e = asUtc(f.ends_at);
  if (s && now < s) return 'upcoming';
  if (e && now >= e) return 'ended';
  return 'open';
}

const canSeeResult = (f) => f.show_result === 'immediate' || (f.show_result === 'after_end' && windowState(f) !== 'open' && windowState(f) !== 'upcoming');

r.get('/p/:code', asyncH(async (req, res) => {
  const f = await liveForm(req.params.code);
  const qs = await query('SELECT marks FROM exam_form_questions WHERE form_id=?', [f.id]);
  const total = qs.reduce((a, q) => a + (q.marks == null ? Number(f.marks_per_q) : Number(q.marks)), 0);
  res.json({
    code: f.code, title: f.title, description: f.description, duration_min: f.duration_min, questions: qs.length, total_marks: total,
    marks_per_q: Number(f.marks_per_q), negative_mark: Number(f.negative_mark), pass_mark: f.pass_mark == null ? null : Number(f.pass_mark),
    needs_password: !!f.password, one_attempt: !!f.one_attempt, starts_at: f.starts_at, ends_at: f.ends_at, state: windowState(f),
    show_leaderboard: !!f.show_leaderboard && canSeeResult(f),
  });
}));

function publicQuestions(f, qs, order, optionOrder) {
  const byId = new Map(qs.map((q) => [q.id, q]));
  return order.map((id) => byId.get(id)).filter(Boolean).map((q) => {
    let options = q.options;
    if (options && optionOrder?.[q.id]) { const m = new Map(options.map((o) => [o.id, o])); options = optionOrder[q.id].map((id) => m.get(id)).filter(Boolean); }
    return { id: q.id, type: q.type, body: q.body, image: q.image, options, multi_count: q.type === 'multi' ? q.answer.length : undefined, marks: q.marks ?? Number(f.marks_per_q) };
  });
}

async function sessionPayload(f, s) {
  const qs = (await query('SELECT * FROM exam_form_questions WHERE form_id=?', [f.id])).map(parseQ);
  const ord = parseJson(s.question_order, {});
  return {
    token: s.token, name: s.name, status: s.status, deadline_at: s.deadline_at ? asUtc(s.deadline_at).toISOString() : null,
    server_now: new Date().toISOString(), answers: parseJson(s.answers, {}) || {},
    questions: publicQuestions(f, qs, ord.q, ord.o),
  };
}

r.post('/p/:code/start', asyncH(async (req, res) => {
  const f = await liveForm(req.params.code);
  const name = String(req.body.name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const device = String(req.body.device || '').slice(0, 40) || null;

  // Resume an unfinished attempt from the same device.
  if (device) {
    const open = await one("SELECT * FROM exam_form_submissions WHERE form_id=? AND device=? AND status='in_progress' ORDER BY id DESC LIMIT 1", [f.id, device]);
    if (open && (!open.deadline_at || asUtc(open.deadline_at) > new Date(Date.now() - 30_000))) return res.json(await sessionPayload(f, open));
    if (open) await finalize(f, open, null);
  }
  await closeExpired(f);
  const st = windowState(f);
  if (st === 'upcoming') throw new HttpError(403, 'পরীক্ষা এখনো শুরু হয়নি');
  if (st !== 'open') throw new HttpError(403, 'পরীক্ষা শেষ হয়ে গেছে');
  if (name.length < 2) throw new HttpError(400, 'আপনার নাম লিখুন');
  if (f.password && String(req.body.password || '').trim() !== f.password) throw new HttpError(403, 'পাসওয়ার্ড সঠিক নয়');
  if (f.one_attempt) {
    const prev = await one(`SELECT token FROM exam_form_submissions WHERE form_id=? AND status='submitted' AND (name_key=? ${device ? 'OR device=?' : ''}) LIMIT 1`,
      device ? [f.id, nameKey(name), device] : [f.id, nameKey(name)]);
    if (prev) { const e = new HttpError(409, 'এই নামে/ডিভাইস থেকে পরীক্ষা আগেই দেওয়া হয়েছে'); e.code = prev.token; throw e; }
  }

  const qs = (await query('SELECT id, type, options FROM exam_form_questions WHERE form_id=? ORDER BY position, id', [f.id])).map(parseQ);
  if (!qs.length) throw new HttpError(400, 'এই পরীক্ষায় এখনো প্রশ্ন নেই');
  const q = f.shuffle_questions ? shuffle(qs.map((x) => x.id)) : qs.map((x) => x.id);
  const o = {};
  if (f.shuffle_options) for (const x of qs) if (x.options) o[x.id] = shuffle(x.options.map((op) => op.id));

  const now = new Date();
  let deadline = f.duration_min ? new Date(now.getTime() + f.duration_min * 60_000) : null;
  const end = asUtc(f.ends_at);
  if (end && (!deadline || end < deadline)) deadline = end;

  const token = crypto.randomBytes(16).toString('hex');
  await query('INSERT INTO exam_form_submissions SET ?', [{
    form_id: f.id, token, name, name_key: nameKey(name), device, ip_hash: ipHash(req), question_order: JSON.stringify({ q, o }),
    answers: JSON.stringify({}), started_at: toSql(now), deadline_at: toSql(deadline),
  }]);
  res.status(201).json(await sessionPayload(f, await one('SELECT * FROM exam_form_submissions WHERE token=?', [token])));
}));

async function openSession(code, token) {
  const f = await liveForm(code);
  const s = await one('SELECT * FROM exam_form_submissions WHERE token=? AND form_id=?', [token, f.id]);
  if (!s) throw new HttpError(404, 'পরীক্ষার সেশন পাওয়া যায়নি');
  return { f, s };
}

const cleanAnswers = (a) => {
  const out = {};
  for (const [k, v] of Object.entries(a || {}).slice(0, 500)) out[k] = Array.isArray(v) ? v.slice(0, 10).map(String) : String(v ?? '').slice(0, 300);
  return out;
};

r.put('/p/:code/save', asyncH(async (req, res) => {
  const { s } = await openSession(req.params.code, req.body.token);
  if (s.status !== 'in_progress') return res.json({ ok: false });
  if (s.deadline_at && asUtc(s.deadline_at) < new Date()) return res.json({ ok: false, expired: true });
  await query('UPDATE exam_form_submissions SET answers=? WHERE id=?', [JSON.stringify(cleanAnswers(req.body.answers)), s.id]);
  res.json({ ok: true });
}));

// Grades and closes an attempt. After the deadline (plus a small network grace) only answers autosaved in time count.
async function finalize(f, s, sent) {
  const now = new Date();
  const late = s.deadline_at && now.getTime() > asUtc(s.deadline_at).getTime() + 20_000;
  const answers = late || !sent ? parseJson(s.answers, {}) || {} : cleanAnswers(sent);
  const qs = (await query('SELECT * FROM exam_form_questions WHERE form_id=?', [f.id])).map(parseQ);
  const g = scoreAll(qs, answers, f);
  const endAt = late ? asUtc(s.deadline_at) : now;
  await query(`UPDATE exam_form_submissions SET status='submitted', answers=?, submitted_at=?, time_sec=?, score=?, total_marks=?, correct=?, wrong=?, skipped=? WHERE id=? AND status='in_progress'`,
    [JSON.stringify(answers), toSql(endAt), Math.max(0, Math.round((endAt - asUtc(s.started_at)) / 1000)), g.score, g.total, g.correct, g.wrong, g.skipped, s.id]);
}

// Attempts abandoned after their deadline (tab closed) are graded from their autosave.
async function closeExpired(f) {
  const stale = await query("SELECT * FROM exam_form_submissions WHERE form_id=? AND status='in_progress' AND deadline_at < UTC_TIMESTAMP() - INTERVAL 30 SECOND", [f.id]);
  for (const s of stale) await finalize(f, s, null);
}

r.post('/p/:code/submit', asyncH(async (req, res) => {
  const { f, s } = await openSession(req.params.code, req.body.token);
  if (s.status !== 'submitted') await finalize(f, s, req.body.answers || {});
  res.json({ token: s.token });
}));

r.get('/p/:code/result/:token', asyncH(async (req, res) => {
  const { f, s } = await openSession(req.params.code, req.params.token);
  const base = { title: f.title, name: s.name, status: s.status, submitted_at: s.submitted_at };
  if (s.status !== 'submitted') return res.json(base);
  if (!canSeeResult(f)) return res.json({ ...base, hidden: true, show_result: f.show_result, ends_at: f.ends_at });
  const rank = await one(`SELECT COUNT(*)+1 r FROM exam_form_submissions WHERE form_id=? AND status='submitted' AND (score>? OR (score=? AND time_sec<?))`,
    [f.id, s.score, s.score, s.time_sec]);
  const count = await one("SELECT COUNT(*) n FROM exam_form_submissions WHERE form_id=? AND status='submitted'", [f.id]);
  const out = {
    ...base, score: Number(s.score), total_marks: Number(s.total_marks), correct: s.correct, wrong: s.wrong, skipped: s.skipped, time_sec: s.time_sec,
    negative_mark: Number(f.negative_mark), pass_mark: f.pass_mark == null ? null : Number(f.pass_mark), rank: rank.r, participants: count.n,
    show_leaderboard: !!f.show_leaderboard,
  };
  if (f.show_answers) {
    const qs = (await query('SELECT * FROM exam_form_questions WHERE form_id=?', [f.id])).map(parseQ);
    const answers = parseJson(s.answers, {}) || {};
    const ord = parseJson(s.question_order, {});
    const byId = new Map(qs.map((q) => [q.id, q]));
    out.review = ord.q.map((id) => byId.get(id)).filter(Boolean).map((q) => ({
      id: q.id, type: q.type, body: q.body, image: q.image, options: q.options, answer: q.answer, explanation: q.explanation,
      given: answers[q.id] ?? null, ...grade(q, answers[q.id], f),
    }));
  }
  res.json(out);
}));

r.get('/p/:code/leaderboard', asyncH(async (req, res) => {
  const f = await liveForm(req.params.code);
  if (!f.show_leaderboard || !canSeeResult(f)) return res.json([]);
  await closeExpired(f);
  const rows = await query(
    `SELECT name, score, total_marks, time_sec FROM exam_form_submissions WHERE form_id=? AND status='submitted' ORDER BY score DESC, time_sec ASC LIMIT 50`, [f.id]);
  res.json(rows.map((x) => ({ ...x, score: Number(x.score), total_marks: Number(x.total_marks) })));
}));

export default r;
