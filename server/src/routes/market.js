// Creator marketplace: verified experts publish question sets / model tests; every set is reviewed
// before it goes live; creators keep 70% of sales. Creator questions carry status 'product' so they
// never leak into the free general bank.
import { Router } from 'express';
import { query, one, tx } from '../db.js';
import { auth, requireRole } from '../middleware/auth.js';
import { asyncH, HttpError, clamp, dhakaToday } from '../services/util.js';
import { createTest } from '../services/engine.js';
import { CREATOR_SHARE } from '../services/billing.js';

const r = Router();
r.use(auth);

const approvedCreator = async (userId) => one(`SELECT * FROM creator_profiles WHERE user_id=? AND status='approved'`, [userId]);
const ownsProduct = async (userId, productId) => one('SELECT * FROM products WHERE id=? AND creator_id=?', [productId, userId]);
const hasAccess = async (user, p) => p.price_bdt === 0 || p.creator_id === user.id || ['admin'].includes(user.role)
  || !!(await one(`SELECT 1 x FROM purchases WHERE user_id=? AND product_id=? AND status='active'`, [user.id, p.id]));

// ---------- Public catalog ----------
r.get('/products', asyncH(async (req, res) => {
  const track = req.query.track || req.user.track;
  const rows = await query(
    `SELECT p.id, p.type, p.title, p.description, p.price_bdt, p.sales, p.rating_sum, p.rating_count, p.duration_min, e.name_bn exam, s.name_bn subject,
            c.display_name creator, c.credential, c.verified, p.creator_id,
            (SELECT COUNT(*) FROM product_questions pq WHERE pq.product_id=p.id) questions,
            EXISTS(SELECT 1 FROM purchases x WHERE x.user_id=? AND x.product_id=p.id AND x.status='active') owned
       FROM products p JOIN creator_profiles c ON c.user_id=p.creator_id LEFT JOIN exams e ON e.id=p.exam_id LEFT JOIN subjects s ON s.id=p.subject_id
      WHERE p.status='published' AND p.track=? ORDER BY (p.rating_count>=3) DESC, p.sales DESC, p.id DESC LIMIT 100`, [req.user.id, track]);
  res.json(rows.map((p) => ({ ...p, rating: p.rating_count ? Math.round((p.rating_sum / p.rating_count) * 10) / 10 : null, owned: !!p.owned })));
}));

r.get('/products/:id', asyncH(async (req, res) => {
  const p = await one(
    `SELECT p.*, c.display_name creator, c.bio, c.credential, c.verified, e.name_bn exam, s.name_bn subject
       FROM products p JOIN creator_profiles c ON c.user_id=p.creator_id LEFT JOIN exams e ON e.id=p.exam_id LEFT JOIN subjects s ON s.id=p.subject_id WHERE p.id=?`, [req.params.id]);
  if (!p || (p.status !== 'published' && p.creator_id !== req.user.id && req.user.role !== 'admin')) throw new HttpError(404, 'পণ্য পাওয়া যায়নি');
  const access = await hasAccess(req.user, p);
  const topics = await query(
    `SELECT t.name_bn, COUNT(*) n FROM product_questions pq JOIN questions q ON q.id=pq.question_id JOIN topics t ON t.id=q.topic_id
      WHERE pq.product_id=? GROUP BY t.id ORDER BY n DESC`, [p.id]);
  // Two sample questions let buyers judge quality before paying.
  const sample = await query(
    `SELECT q.id, q.body, q.option_a, q.option_b, q.option_c, q.option_d FROM product_questions pq JOIN questions q ON q.id=pq.question_id
      WHERE pq.product_id=? ORDER BY pq.position LIMIT 2`, [p.id]);
  const reviews = await query(
    `SELECT r.rating, r.comment, r.created_at, u.name FROM product_reviews r JOIN users u ON u.id=r.user_id WHERE r.product_id=? ORDER BY r.created_at DESC LIMIT 30`, [p.id]);
  const mine = await one('SELECT rating, comment FROM product_reviews WHERE product_id=? AND user_id=?', [p.id, req.user.id]);
  const my = await one(
    `SELECT MAX(a.score) best, COUNT(*) n FROM attempts a JOIN tests t ON t.id=a.test_id
      WHERE a.user_id=? AND a.status='submitted' AND JSON_EXTRACT(t.meta, '$.product_id')=?`, [req.user.id, p.id]);
  res.json({
    ...p, access, owned: access && p.price_bdt > 0, topics, sample, reviews, my_review: mine, my_attempts: my.n, my_best: my.best,
    rating: p.rating_count ? Math.round((p.rating_sum / p.rating_count) * 10) / 10 : null, questions: topics.reduce((a, t) => a + t.n, 0),
  });
}));

// Free products are "bought" with one click; paid ones go through /billing/checkout with product_id.
r.post('/products/:id/claim', asyncH(async (req, res) => {
  const p = await one(`SELECT * FROM products WHERE id=? AND status='published' AND price_bdt=0`, [req.params.id]);
  if (!p) throw new HttpError(400, 'এটি ফ্রি পণ্য নয়');
  await query('INSERT IGNORE INTO purchases (user_id, product_id, price_bdt) VALUES (?,?,0)', [req.user.id, p.id]);
  res.json({ ok: true });
}));

r.post('/products/:id/start', asyncH(async (req, res) => {
  const p = await one('SELECT * FROM products WHERE id=?', [req.params.id]);
  if (!p || (p.status !== 'published' && p.creator_id !== req.user.id && req.user.role !== 'admin')) throw new HttpError(404, 'পণ্য পাওয়া যায়নি');
  if (!(await hasAccess(req.user, p))) throw new HttpError(402, 'আগে কিনুন', 'purchase_required');
  const ids = (await query('SELECT question_id FROM product_questions WHERE product_id=? ORDER BY position', [p.id])).map((x) => x.question_id);
  if (!ids.length) throw new HttpError(400, 'এখনো কোনো প্রশ্ন নেই');
  const exam = p.exam_id ? await one('SELECT * FROM exams WHERE id=?', [p.exam_id]) : null;
  const timed = p.type === 'model_test' || req.body.timed;
  const testId = await createTest({
    title: p.title, kind: timed ? 'mock' : 'practice', track: p.track, examId: p.exam_id, questionIds: timed ? ids : ids.sort(() => Math.random() - 0.5),
    durationSec: timed ? (p.duration_min ? p.duration_min * 60 : ids.length * (exam?.sec_per_question || 40)) : 0,
    negativeMark: timed ? Number(exam?.negative_mark || 0) : 0, instantFeedback: !timed, meta: { product_id: p.id }, userId: req.user.id,
  });
  res.json({ test_id: testId });
}));

r.post('/products/:id/review', asyncH(async (req, res) => {
  const p = await one(`SELECT * FROM products WHERE id=? AND status='published'`, [req.params.id]);
  if (!p) throw new HttpError(404, 'পণ্য পাওয়া যায়নি');
  if (p.creator_id === req.user.id) throw new HttpError(400, 'নিজের পণ্যে রিভিউ দেওয়া যায় না');
  const tried = await one(`SELECT 1 x FROM attempts a JOIN tests t ON t.id=a.test_id WHERE a.user_id=? AND a.status='submitted' AND JSON_EXTRACT(t.meta, '$.product_id')=? LIMIT 1`, [req.user.id, p.id]);
  if (!tried) throw new HttpError(400, 'রিভিউ দিতে আগে অন্তত একবার সেটটি সম্পন্ন করুন');
  const rating = clamp(Math.round(Number(req.body.rating)), 1, 5);
  await tx(async (q) => {
    const [old] = await q('SELECT rating FROM product_reviews WHERE product_id=? AND user_id=?', [p.id, req.user.id]);
    await q('INSERT INTO product_reviews (product_id, user_id, rating, comment) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE rating=VALUES(rating), comment=VALUES(comment)',
      [p.id, req.user.id, rating, String(req.body.comment || '').slice(0, 1000) || null]);
    await q('UPDATE products SET rating_sum=rating_sum+?, rating_count=rating_count+? WHERE id=?', [rating - (old?.rating || 0), old ? 0 : 1, p.id]);
  });
  res.json({ ok: true });
}));

r.get('/library', asyncH(async (req, res) => {
  res.json(await query(
    `SELECT p.id, p.title, p.type, p.price_bdt, c.display_name creator, pu.created_at
       FROM purchases pu JOIN products p ON p.id=pu.product_id JOIN creator_profiles c ON c.user_id=p.creator_id
      WHERE pu.user_id=? AND pu.status='active' ORDER BY pu.id DESC`, [req.user.id]));
}));

// ---------- Creator studio ----------
r.get('/creator/me', asyncH(async (req, res) => {
  const profile = await one('SELECT * FROM creator_profiles WHERE user_id=?', [req.user.id]);
  if (!profile) return res.json({ profile: null });
  const products = await query(
    `SELECT p.*, (SELECT COUNT(*) FROM product_questions pq WHERE pq.product_id=p.id) questions FROM products p WHERE p.creator_id=? ORDER BY p.id DESC`, [req.user.id]);
  const earn = await one(
    `SELECT COALESCE(SUM(pu.creator_share_bdt),0) earned, COUNT(*) sales FROM purchases pu JOIN products p ON p.id=pu.product_id
      WHERE p.creator_id=? AND pu.status='active'`, [req.user.id]);
  const paid = await one('SELECT COALESCE(SUM(amount_bdt),0) paid FROM creator_payouts WHERE creator_id=?', [req.user.id]);
  const payouts = await query('SELECT amount_bdt, method, reference, created_at FROM creator_payouts WHERE creator_id=? ORDER BY id DESC LIMIT 20', [req.user.id]);
  res.json({ profile, products, earnings: { earned: Number(earn.earned), paid: Number(paid.paid), balance: Number(earn.earned) - Number(paid.paid), sales: earn.sales, share: CREATOR_SHARE }, payouts });
}));

r.post('/creator/apply', asyncH(async (req, res) => {
  const { display_name, bio, credential, evidence_url, payout_method, payout_number } = req.body;
  if (!display_name?.trim() || !credential?.trim()) throw new HttpError(400, 'নাম ও যোগ্যতা (যেমন: ৪৩তম বিসিএস, শিক্ষা ক্যাডার) দিন');
  await query(
    `INSERT INTO creator_profiles (user_id, display_name, bio, credential, evidence_url, payout_method, payout_number) VALUES (?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE display_name=VALUES(display_name), bio=VALUES(bio), credential=VALUES(credential), evidence_url=VALUES(evidence_url),
       payout_method=VALUES(payout_method), payout_number=VALUES(payout_number), status=IF(status='rejected','pending',status)`,
    [req.user.id, display_name.trim().slice(0, 120), bio || null, credential.trim().slice(0, 255), evidence_url || null, payout_method || null, payout_number || null]);
  res.json({ ok: true });
}));

r.post('/creator/products', asyncH(async (req, res) => {
  if (!(await approvedCreator(req.user.id))) throw new HttpError(403, 'আগে ক্রিয়েটর হিসেবে অনুমোদন নিন');
  const b = req.body;
  if (!b.title?.trim()) throw new HttpError(400, 'শিরোনাম দিন');
  const price = clamp(Math.round(Number(b.price_bdt) || 0), 0, 2000);
  const ins = await query('INSERT INTO products SET ?', [{
    creator_id: req.user.id, type: b.type === 'model_test' ? 'model_test' : 'question_set', title: b.title.trim().slice(0, 200), description: b.description || null,
    track: ['academic', 'admission', 'job'].includes(b.track) ? b.track : req.user.track, exam_id: b.exam_id || null, subject_id: b.subject_id || null,
    price_bdt: price, duration_min: b.duration_min || null }]);
  res.json({ id: ins.insertId });
}));

r.put('/creator/products/:id', asyncH(async (req, res) => {
  const p = await ownsProduct(req.user.id, req.params.id);
  if (!p) throw new HttpError(404, 'পণ্য পাওয়া যায়নি');
  const b = req.body;
  // Editing a live product sends it back to review so buyers always get checked content.
  await query(`UPDATE products SET title=COALESCE(?,title), description=COALESCE(?,description), price_bdt=COALESCE(?,price_bdt), duration_min=COALESCE(?,duration_min),
               status=IF(status='published' AND ?, 'review', status) WHERE id=?`,
    [b.title || null, b.description ?? null, b.price_bdt != null ? clamp(Math.round(b.price_bdt), 0, 2000) : null, b.duration_min || null, b.content_changed ? 1 : 0, p.id]);
  res.json({ ok: true });
}));

r.get('/creator/products/:id/questions', asyncH(async (req, res) => {
  const p = await ownsProduct(req.user.id, req.params.id);
  if (!p && req.user.role !== 'admin') throw new HttpError(404, 'পণ্য পাওয়া যায়নি');
  res.json(await query(
    `SELECT q.*, t.name_bn topic FROM product_questions pq JOIN questions q ON q.id=pq.question_id JOIN topics t ON t.id=q.topic_id
      WHERE pq.product_id=? ORDER BY pq.position`, [req.params.id]));
}));

r.post('/creator/products/:id/questions', asyncH(async (req, res) => {
  const p = await ownsProduct(req.user.id, req.params.id);
  if (!p) throw new HttpError(404, 'পণ্য পাওয়া যায়নি');
  if (!['draft', 'rejected'].includes(p.status)) throw new HttpError(400, 'পর্যালোচনাধীন/প্রকাশিত সেটে সরাসরি প্রশ্ন যোগ করা যায় না — আগে "খসড়ায় ফেরান"');
  const list = Array.isArray(req.body) ? req.body : [req.body];
  const n = (await one('SELECT COUNT(*) n FROM product_questions WHERE product_id=?', [p.id])).n;
  if (n + list.length > 300) throw new HttpError(400, 'একটি সেটে সর্বোচ্চ ৩০০ প্রশ্ন');
  let pos = n, added = 0;
  for (const q of list) {
    const opt = (k) => String(q[`option_${k}`] || '').trim();
    if (!q.topic_id || !String(q.body || '').trim() || !['a', 'b', 'c', 'd'].includes(q.correct_option) || !opt('a') || !opt('b') || !opt('c') || !opt('d')) continue;
    if (!q.explanation?.trim()) throw new HttpError(400, 'প্রতিটি প্রশ্নে ব্যাখ্যা বাধ্যতামূলক — মানসম্পন্ন কনটেন্টের জন্য');
    const topic = await one('SELECT subject_id FROM topics WHERE id=?', [q.topic_id]);
    if (!topic) continue;
    const ins = await query('INSERT INTO questions SET ?', [{
      subject_id: topic.subject_id, topic_id: q.topic_id, body: q.body.trim(), option_a: opt('a'), option_b: opt('b'), option_c: opt('c'), option_d: opt('d'),
      correct_option: q.correct_option, explanation: q.explanation.trim(), difficulty: clamp(Number(q.difficulty) || 3, 1, 5),
      source: q.source || null, status: 'product', created_by: req.user.id }]);
    await query('INSERT INTO product_questions (product_id, question_id, position) VALUES (?,?,?)', [p.id, ins.insertId, ++pos]);
    added++;
  }
  res.json({ added });
}));

r.delete('/creator/products/:id/questions/:qid', asyncH(async (req, res) => {
  const p = await ownsProduct(req.user.id, req.params.id);
  if (!p || !['draft', 'rejected'].includes(p.status)) throw new HttpError(400, 'শুধু খসড়া সেট থেকে মুছতে পারবেন');
  await query('DELETE FROM product_questions WHERE product_id=? AND question_id=?', [p.id, req.params.qid]);
  res.json({ ok: true });
}));

r.post('/creator/products/:id/submit', asyncH(async (req, res) => {
  const p = await ownsProduct(req.user.id, req.params.id);
  if (!p) throw new HttpError(404, 'পণ্য পাওয়া যায়নি');
  const n = (await one('SELECT COUNT(*) n FROM product_questions WHERE product_id=?', [p.id])).n;
  if (n < 10) throw new HttpError(400, 'পর্যালোচনায় পাঠাতে কমপক্ষে ১০টি প্রশ্ন লাগবে');
  await query(`UPDATE products SET status='review' WHERE id=?`, [p.id]);
  res.json({ ok: true });
}));

r.post('/creator/products/:id/draft', asyncH(async (req, res) => {
  const p = await ownsProduct(req.user.id, req.params.id);
  if (!p) throw new HttpError(404, 'পণ্য পাওয়া যায়নি');
  // Taking a live product back to draft unlists it; existing buyers keep access.
  await query(`UPDATE products SET status='draft' WHERE id=?`, [p.id]);
  res.json({ ok: true });
}));

// ---------- Admin ----------
r.get('/admin/creators', requireRole('admin'), asyncH(async (req, res) => {
  res.json(await query(
    `SELECT c.*, u.name, u.email, u.phone, (SELECT COUNT(*) FROM products p WHERE p.creator_id=c.user_id) products,
            (SELECT COALESCE(SUM(pu.creator_share_bdt),0) FROM purchases pu JOIN products p ON p.id=pu.product_id WHERE p.creator_id=c.user_id AND pu.status='active') -
            (SELECT COALESCE(SUM(amount_bdt),0) FROM creator_payouts x WHERE x.creator_id=c.user_id) balance
       FROM creator_profiles c JOIN users u ON u.id=c.user_id ORDER BY c.status='pending' DESC, c.created_at DESC`));
}));

r.put('/admin/creators/:userId', requireRole('admin'), asyncH(async (req, res) => {
  const { status, verified, admin_note } = req.body;
  if (!['approved', 'rejected', 'pending'].includes(status)) throw new HttpError(400, 'অবৈধ স্ট্যাটাস');
  await query('UPDATE creator_profiles SET status=?, verified=?, admin_note=? WHERE user_id=?', [status, verified ? 1 : 0, admin_note || null, req.params.userId]);
  res.json({ ok: true });
}));

r.get('/admin/review', requireRole('admin'), asyncH(async (req, res) => {
  res.json(await query(
    `SELECT p.*, c.display_name creator, (SELECT COUNT(*) FROM product_questions pq WHERE pq.product_id=p.id) questions
       FROM products p JOIN creator_profiles c ON c.user_id=p.creator_id WHERE p.status='review' ORDER BY p.id`));
}));

r.put('/admin/products/:id', requireRole('admin'), asyncH(async (req, res) => {
  const { action, admin_note } = req.body;
  if (action === 'publish') await query(`UPDATE products SET status='published', published_at=COALESCE(published_at, UTC_TIMESTAMP()), admin_note=? WHERE id=?`, [admin_note || null, req.params.id]);
  else if (action === 'reject') await query(`UPDATE products SET status='rejected', admin_note=? WHERE id=?`, [admin_note || 'মান উন্নয়নের প্রয়োজন', req.params.id]);
  else if (action === 'unlist') await query(`UPDATE products SET status='unlisted', admin_note=? WHERE id=?`, [admin_note || null, req.params.id]);
  else throw new HttpError(400, 'অবৈধ অ্যাকশন');
  if (action === 'publish') await query(`UPDATE questions q JOIN product_questions pq ON pq.question_id=q.id SET q.last_verified_at=? WHERE pq.product_id=?`, [dhakaToday(), req.params.id]);
  res.json({ ok: true });
}));

r.post('/admin/payouts', requireRole('admin'), asyncH(async (req, res) => {
  const { creator_id, amount_bdt, method, reference } = req.body;
  if (!(Number(amount_bdt) > 0)) throw new HttpError(400, 'পরিমাণ দিন');
  await query('INSERT INTO creator_payouts (creator_id, amount_bdt, method, reference, paid_by) VALUES (?,?,?,?,?)', [creator_id, Number(amount_bdt), method || null, reference || null, req.user.id]);
  res.json({ ok: true });
}));

export default r;
