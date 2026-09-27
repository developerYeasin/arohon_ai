import { Router } from 'express';
import { query, one, tx } from '../db.js';
import { auth, requireRole } from '../middleware/auth.js';
import { asyncH, HttpError, clamp, dhakaToday, pct, toBn } from '../services/util.js';
import { createTest, pickMock } from '../services/engine.js';
import { markPaidAndActivate, refundPayment } from '../services/billing.js';

const r = Router();
r.use(auth, requireRole('admin', 'teacher'));

const Q_FIELDS = ['subject_id', 'topic_id', 'body', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_option', 'explanation',
  'difficulty', 'source', 'exam_ref', 'year', 'current_affair_id', 'status'];

function cleanQuestion(b) {
  const q = {};
  for (const k of Q_FIELDS) if (b[k] !== undefined) q[k] = b[k] === '' ? null : b[k];
  if (q.correct_option) q.correct_option = String(q.correct_option).toLowerCase();
  if (q.correct_option && !['a', 'b', 'c', 'd'].includes(q.correct_option)) throw new HttpError(400, 'সঠিক উত্তর a/b/c/d হতে হবে');
  if (q.difficulty) q.difficulty = clamp(Number(q.difficulty), 1, 5);
  return q;
}

r.get('/overview', asyncH(async (_req, res) => {
  res.json(await one(`SELECT
    (SELECT COUNT(*) FROM questions WHERE status='active') active_questions,
    (SELECT COUNT(*) FROM questions WHERE status='needs_review') needs_review,
    (SELECT COUNT(*) FROM question_reports WHERE status='open') open_reports,
    (SELECT COUNT(*) FROM users) users,
    (SELECT COUNT(DISTINCT user_id) FROM attempts WHERE submitted_at >= UTC_TIMESTAMP() - INTERVAL 1 DAY) dau,
    (SELECT COUNT(DISTINCT user_id) FROM attempts WHERE submitted_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY) wau,
    (SELECT COUNT(*) FROM attempts WHERE status='submitted') attempts,
    (SELECT COUNT(*) FROM attempt_answers) answers,
    (SELECT COUNT(*) FROM payments WHERE status='pending' AND method LIKE 'manual%') pending_payments,
    (SELECT COALESCE(SUM(amount_bdt),0) FROM payments WHERE status='paid' AND method<>'demo' AND paid_at >= UTC_TIMESTAMP() - INTERVAL 30 DAY) revenue_30d,
    (SELECT COUNT(DISTINCT user_id) FROM subscriptions WHERE status='active' AND ends_at > UTC_TIMESTAMP()) active_subscribers`));
}));

// ---------- Question bank ----------
r.get('/questions', asyncH(async (req, res) => {
  const where = ['1=1']; const params = [];
  for (const k of ['subject_id', 'topic_id', 'status']) if (req.query[k]) { where.push(`q.${k}=?`); params.push(req.query[k]); }
  if (req.query.search) { where.push('q.body LIKE ?'); params.push(`%${req.query.search}%`); }
  const page = Math.max(1, Number(req.query.page) || 1);
  const total = await one(`SELECT COUNT(*) n FROM questions q WHERE ${where.join(' AND ')}`, params);
  const rows = await query(
    `SELECT q.*, s.name_bn subject, t.name_bn topic FROM questions q JOIN subjects s ON s.id=q.subject_id JOIN topics t ON t.id=q.topic_id
      WHERE ${where.join(' AND ')} ORDER BY q.id DESC LIMIT 25 OFFSET ?`, [...params, (page - 1) * 25]);
  res.json({ total: total.n, page, rows });
}));

r.get('/questions/:id', asyncH(async (req, res) => {
  const q = await one('SELECT * FROM questions WHERE id=?', [req.params.id]);
  if (!q) throw new HttpError(404, 'প্রশ্ন পাওয়া যায়নি');
  res.json(q);
}));

r.post('/questions', asyncH(async (req, res) => {
  const q = cleanQuestion(req.body);
  for (const k of ['subject_id', 'topic_id', 'body', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_option'])
    if (!q[k]) throw new HttpError(400, `${k} প্রয়োজন`);
  q.created_by = req.user.id; q.last_verified_at = dhakaToday();
  const ins = await query('INSERT INTO questions SET ?', [q]);
  await query('INSERT INTO question_versions (question_id, version, snapshot, change_note, changed_by) VALUES (?,1,?,?,?)',
    [ins.insertId, JSON.stringify(q), 'তৈরি', req.user.id]);
  res.json({ id: ins.insertId });
}));

// JSON bulk import: [{subject_id, topic_id, body, option_a..d, correct_option, ...}]
r.post('/questions/bulk', asyncH(async (req, res) => {
  const list = Array.isArray(req.body) ? req.body : req.body.questions;
  if (!Array.isArray(list) || !list.length) throw new HttpError(400, 'প্রশ্নের তালিকা দিন');
  const errors = []; let created = 0;
  for (const [i, raw] of list.entries()) {
    try {
      const q = cleanQuestion(raw);
      if (!q.topic_id || !q.body || !q.correct_option) throw new Error('topic_id/body/correct_option প্রয়োজন');
      if (!q.subject_id) q.subject_id = (await one('SELECT subject_id FROM topics WHERE id=?', [q.topic_id]))?.subject_id;
      q.created_by = req.user.id; q.last_verified_at = dhakaToday();
      await query('INSERT INTO questions SET ?', [q]); created++;
    } catch (e) { errors.push({ index: i, error: e.message }); }
  }
  res.json({ created, errors });
}));

// Every edit is versioned, so corrections are auditable.
r.put('/questions/:id', asyncH(async (req, res) => {
  const cur = await one('SELECT * FROM questions WHERE id=?', [req.params.id]);
  if (!cur) throw new HttpError(404, 'প্রশ্ন পাওয়া যায়নি');
  const q = cleanQuestion(req.body);
  const version = cur.version + 1;
  await tx(async (x) => {
    await x('UPDATE questions SET ?, version=?, last_verified_at=? WHERE id=?', [q, version, dhakaToday(), cur.id]);
    const snap = await x('SELECT * FROM questions WHERE id=?', [cur.id]);
    await x('INSERT INTO question_versions (question_id, version, snapshot, change_note, changed_by) VALUES (?,?,?,?,?)',
      [cur.id, version, JSON.stringify(snap[0]), req.body.change_note || 'সংশোধন', req.user.id]);
  });
  res.json({ ok: true, version });
}));

r.delete('/questions/:id', asyncH(async (req, res) => {
  await query(`UPDATE questions SET status='retired' WHERE id=?`, [req.params.id]);
  res.json({ ok: true });
}));

r.get('/questions/:id/versions', asyncH(async (req, res) => {
  res.json(await query(
    `SELECT v.version, v.change_note, v.changed_at, u.name changed_by, v.snapshot FROM question_versions v LEFT JOIN users u ON u.id=v.changed_by
      WHERE v.question_id=? ORDER BY v.version DESC`, [req.params.id]));
}));

// ---------- Report → verify → fix pipeline ----------
r.get('/reports', asyncH(async (req, res) => {
  res.json(await query(
    `SELECT r.*, u.name reporter, q.body, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option, q.explanation, q.status q_status,
            (SELECT COUNT(*) FROM question_reports r2 WHERE r2.question_id=r.question_id AND r2.status='open') open_for_question
       FROM question_reports r JOIN users u ON u.id=r.user_id JOIN questions q ON q.id=r.question_id
      WHERE r.status=? ORDER BY open_for_question DESC, r.id ASC LIMIT 100`, [req.query.status || 'open']));
}));

r.put('/reports/:id', asyncH(async (req, res) => {
  const { status, resolution_note } = req.body;
  if (!['verified_ok', 'fixed', 'rejected'].includes(status)) throw new HttpError(400, 'অবৈধ স্ট্যাটাস');
  const rep = await one('SELECT * FROM question_reports WHERE id=?', [req.params.id]);
  if (!rep) throw new HttpError(404, 'রিপোর্ট পাওয়া যায়নি');
  // Resolving one report resolves all open reports on the same question.
  await query(`UPDATE question_reports SET status=?, resolution_note=?, resolved_by=?, resolved_at=UTC_TIMESTAMP() WHERE question_id=? AND status='open'`,
    [status, resolution_note || null, req.user.id, rep.question_id]);
  await query(`UPDATE questions SET status='active', last_verified_at=? WHERE id=? AND status='needs_review'`, [dhakaToday(), rep.question_id]);
  res.json({ ok: true });
}));

// ---------- Question analytics: the bank improves itself ----------
r.get('/question-analytics', asyncH(async (req, res) => {
  const rows = await query(
    `SELECT q.id, LEFT(q.body, 140) body, q.difficulty, q.attempt_count, q.correct_count, q.skip_count, q.report_count, q.total_time_ms,
            q.correct_option, q.wrong_a, q.wrong_b, q.wrong_c, q.wrong_d, t.name_bn topic,
            (SELECT AVG(a.score/a.total) FROM attempt_answers aa JOIN attempts a ON a.id=aa.attempt_id WHERE aa.question_id=q.id AND aa.is_correct=1 AND a.total>0) p_correct,
            (SELECT AVG(a.score/a.total) FROM attempt_answers aa JOIN attempts a ON a.id=aa.attempt_id WHERE aa.question_id=q.id AND aa.is_correct=0 AND a.total>0) p_wrong
       FROM questions q JOIN topics t ON t.id=q.topic_id WHERE q.attempt_count >= ? ORDER BY q.attempt_count DESC LIMIT 300`, [Number(req.query.min) || 3]);
  res.json(rows.map((q) => {
    const acc = pct(q.correct_count, q.attempt_count);
    const wrongs = { a: q.wrong_a, b: q.wrong_b, c: q.wrong_c, d: q.wrong_d };
    const topWrong = Object.entries(wrongs).sort((a, b) => b[1] - a[1])[0];
    const discrimination = q.p_correct != null && q.p_wrong != null ? Math.round((q.p_correct - q.p_wrong) * 100) / 100 : null;
    const flags = [];
    if (discrimination != null && discrimination < 0 && q.attempt_count >= 20) flags.push('দুর্বল শিক্ষার্থীরা বেশি পারছে — উত্তর ভুল হতে পারে');
    if (acc < 15 && q.attempt_count >= 10) flags.push('অতিরিক্ত কঠিন/সম্ভাব্য ভুল উত্তর');
    if (topWrong[1] > q.correct_count && q.attempt_count >= 10) flags.push(`বেশিরভাগ '${topWrong[0].toUpperCase()}' দিচ্ছে — অস্পষ্ট হতে পারে`);
    if (q.report_count >= 2) flags.push(`${q.report_count}টি রিপোর্ট`);
    const empiricalDifficulty = acc >= 80 ? 1 : acc >= 60 ? 2 : acc >= 40 ? 3 : acc >= 20 ? 4 : 5;
    if (Math.abs(empiricalDifficulty - q.difficulty) >= 2 && q.attempt_count >= 20) flags.push(`লেবেল কঠিনতা ${toBn(q.difficulty)}, বাস্তবে ${toBn(empiricalDifficulty)}`);
    return { id: q.id, body: q.body, topic: q.topic, attempts: q.attempt_count, accuracy: acc, skip_rate: pct(q.skip_count, q.attempt_count),
      avg_sec: Math.round(q.total_time_ms / 1000 / Math.max(1, q.attempt_count - q.skip_count)), difficulty: q.difficulty, empirical_difficulty: empiricalDifficulty,
      discrimination, common_wrong: topWrong[1] ? topWrong[0] : null, reports: q.report_count, flags };
  }).sort((a, b) => b.flags.length - a.flags.length));
}));

// ---------- Taxonomy ----------
r.post('/subjects', requireRole('admin'), asyncH(async (req, res) => {
  const { track, slug, name_bn, name_en } = req.body;
  const ins = await query('INSERT INTO subjects (track, slug, name_bn, name_en) VALUES (?,?,?,?)', [track, slug, name_bn, name_en || name_bn]);
  res.json({ id: ins.insertId });
}));

r.post('/topics', asyncH(async (req, res) => {
  const ins = await query('INSERT INTO topics (subject_id, name_bn, name_en) VALUES (?,?,?)', [req.body.subject_id, req.body.name_bn, req.body.name_en || null]);
  res.json({ id: ins.insertId });
}));

// ---------- Live exams ----------
r.post('/live-tests', asyncH(async (req, res) => {
  const { title, exam_id, count = 50, starts_at, duration_min, window_min } = req.body;
  const exam = await one('SELECT * FROM exams WHERE id=?', [exam_id]);
  if (!exam || !starts_at) throw new HttpError(400, 'পরীক্ষা ও শুরুর সময় দিন');
  const ids = await pickMock(req.user.id, exam, clamp(Number(count), 5, exam.total_questions));
  const start = new Date(starts_at);
  const dur = Number(duration_min) || Math.ceil((ids.length * exam.sec_per_question) / 60);
  const end = new Date(start.getTime() + (Number(window_min) || dur + 30) * 60000);
  const id = await createTest({ title: title || `${exam.name_bn} লাইভ মডেল টেস্ট`, kind: 'live', track: exam.track, examId: exam.id,
    questionIds: ids, durationSec: dur * 60, negativeMark: Number(exam.negative_mark), isPublic: true,
    startsAt: start.toISOString().slice(0, 19).replace('T', ' '), endsAt: end.toISOString().slice(0, 19).replace('T', ' '), userId: req.user.id });
  res.json({ id });
}));

r.delete('/live-tests/:id', asyncH(async (req, res) => {
  await query(`DELETE FROM tests WHERE id=? AND kind='live'`, [req.params.id]);
  res.json({ ok: true });
}));

// ---------- Current affairs ----------
r.post('/current-affairs', asyncH(async (req, res) => {
  const { title, category, summary, key_facts = [], published_on } = req.body;
  if (!title || !category || !summary) throw new HttpError(400, 'শিরোনাম, ক্যাটাগরি ও সারাংশ দিন');
  const ins = await query('INSERT INTO current_affairs (title, category, summary, key_facts, published_on) VALUES (?,?,?,?,?)',
    [title, category, summary, JSON.stringify(key_facts), published_on || dhakaToday()]);
  res.json({ id: ins.insertId });
}));

// ---------- Teacher dashboard ----------
r.get('/students', asyncH(async (req, res) => {
  const scoped = req.user.role === 'teacher' && req.user.institution;
  const rows = await query(
    `SELECT u.id, u.name, u.track, u.district, u.institution, u.streak, u.last_active_date,
            COUNT(a.id) tests, ROUND(100*SUM(a.correct)/NULLIF(SUM(a.correct+a.wrong),0)) accuracy,
            ROUND(100*SUM(CASE WHEN a.submitted_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY THEN a.correct END)/
                  NULLIF(SUM(CASE WHEN a.submitted_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY THEN a.correct+a.wrong END),0)) acc_7d,
            ROUND(100*SUM(CASE WHEN a.submitted_at < UTC_TIMESTAMP() - INTERVAL 7 DAY THEN a.correct END)/
                  NULLIF(SUM(CASE WHEN a.submitted_at < UTC_TIMESTAMP() - INTERVAL 7 DAY THEN a.correct+a.wrong END),0)) acc_before
       FROM users u LEFT JOIN attempts a ON a.user_id=u.id AND a.status='submitted'
      WHERE u.role='student' ${scoped ? 'AND u.institution=?' : ''} GROUP BY u.id ORDER BY tests DESC LIMIT 500`, scoped ? [req.user.institution] : []);
  const today = dhakaToday();
  const students = rows.map((s) => {
    const inactiveDays = s.last_active_date ? Math.round((new Date(today) - new Date(s.last_active_date)) / 86400000) : null;
    const risk = [];
    if (inactiveDays == null || inactiveDays >= 5) risk.push(inactiveDays == null ? 'কখনো অনুশীলন করেনি' : `${inactiveDays} দিন নিষ্ক্রিয়`);
    if (s.acc_7d != null && s.acc_before != null && s.acc_before - s.acc_7d >= 10) risk.push(`নির্ভুলতা ${s.acc_before}% → ${s.acc_7d}%`);
    if (s.accuracy != null && s.accuracy < 40 && s.tests >= 3) risk.push('গড় নির্ভুলতা ৪০%-এর নিচে');
    return { ...s, improvement: s.acc_7d != null && s.acc_before != null ? s.acc_7d - s.acc_before : null, risk };
  });
  const weakTopics = await query(
    `SELECT t.name_bn topic, s.name_bn subject, COUNT(*) answers, ROUND(100*SUM(aa.is_correct)/COUNT(*)) accuracy
       FROM attempt_answers aa JOIN questions q ON q.id=aa.question_id JOIN topics t ON t.id=q.topic_id JOIN subjects s ON s.id=q.subject_id
       JOIN users u ON u.id=aa.user_id
      WHERE aa.selected_option IS NOT NULL ${scoped ? 'AND u.institution=?' : ''}
      GROUP BY t.id, s.id HAVING answers >= 5 ORDER BY accuracy ASC LIMIT 10`, scoped ? [req.user.institution] : []);
  res.json({
    summary: {
      students: students.length, active_7d: students.filter((s) => s.last_active_date && (new Date(today) - new Date(s.last_active_date)) / 86400000 <= 7).length,
      avg_accuracy: Math.round(students.filter((s) => s.accuracy != null).reduce((a, s, _, arr) => a + s.accuracy / arr.length, 0)) || null,
      at_risk: students.filter((s) => s.risk.length).length,
    },
    students, weak_topics: weakTopics,
  });
}));

// ---------- Payments (admin only) ----------
r.get('/payments', requireRole('admin'), asyncH(async (req, res) => {
  const status = req.query.status || 'pending';
  res.json(await query(
    `SELECT p.*, u.name, u.email, u.phone, COALESCE(pl.name_bn, CONCAT('🛒 ', pr.title)) plan_name FROM payments p JOIN users u ON u.id=p.user_id
       LEFT JOIN plans pl ON pl.code=p.plan_code LEFT JOIN products pr ON pr.id=p.product_id
      WHERE p.status=? ORDER BY p.id ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT 200`, [status]));
}));

// Manual payments are approved after matching the TrxID against the bKash/Nagad statement.
r.put('/payments/:id', requireRole('admin'), asyncH(async (req, res) => {
  const { action, note } = req.body;
  const p = await one('SELECT * FROM payments WHERE id=?', [req.params.id]);
  if (!p) throw new HttpError(404, 'পেমেন্ট পাওয়া যায়নি');
  if (action === 'approve') {
    if (p.status !== 'pending') throw new HttpError(400, 'শুধু অপেক্ষমাণ পেমেন্ট অনুমোদন করা যায়');
    await markPaidAndActivate(p.id, { reviewerId: req.user.id });
    if (note) await query('UPDATE payments SET admin_note=? WHERE id=?', [note, p.id]);
  } else if (action === 'reject') {
    await query(`UPDATE payments SET status='rejected', admin_note=?, reviewed_by=? WHERE id=? AND status='pending'`, [note || null, req.user.id, p.id]);
  } else if (action === 'refund') {
    await refundPayment(p.id, req.user.id, note);
  } else throw new HttpError(400, 'অবৈধ অ্যাকশন');
  res.json({ ok: true });
}));

r.get('/plans', requireRole('admin'), asyncH(async (_req, res) => res.json(await query('SELECT * FROM plans ORDER BY sort_order'))));
r.put('/plans/:code', requireRole('admin'), asyncH(async (req, res) => {
  const { name_bn, price_bdt, duration_days, is_active, highlight } = req.body;
  await query('UPDATE plans SET name_bn=COALESCE(?,name_bn), price_bdt=COALESCE(?,price_bdt), duration_days=COALESCE(?,duration_days), is_active=COALESCE(?,is_active), highlight=? WHERE code=?',
    [name_bn ?? null, price_bdt ?? null, duration_days ?? null, is_active ?? null, highlight || null, req.params.code]);
  res.json({ ok: true });
}));

export default r;
