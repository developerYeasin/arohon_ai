import { Router } from 'express';
import { query, one } from '../db.js';
import { auth } from '../middleware/auth.js';
import { asyncH, HttpError } from '../services/util.js';
import { getAccess, FREE_LIMITS, TRIAL_DAYS, bkashEnabled, bkashCreate, bkashExecute, markPaidAndActivate, usedToday, coachUsedToday } from '../services/billing.js';

const r = Router();

const MANUAL = {
  manual_bkash: { label: 'bKash', env: 'MANUAL_BKASH_NUMBER' },
  manual_nagad: { label: 'Nagad', env: 'MANUAL_NAGAD_NUMBER' },
  manual_rocket: { label: 'Rocket', env: 'MANUAL_ROCKET_NUMBER' },
};
const demoEnabled = () => process.env.PAYMENT_DEMO === 'true' && process.env.NODE_ENV !== 'production';
const clientUrl = () => (process.env.CLIENT_URL || process.env.CLIENT_ORIGIN?.split(',')[0] || 'http://localhost:5173').replace(/\/$/, '');
const apiUrl = () => (process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/$/, '');

function methods() {
  const list = [];
  if (bkashEnabled()) list.push({ code: 'bkash_gateway', label: 'bKash (অটোমেটিক)', auto: true });
  for (const [code, m] of Object.entries(MANUAL)) {
    if (process.env[m.env]) list.push({ code, label: `${m.label} (Send Money)`, auto: false, number: process.env[m.env] });
  }
  if (demoEnabled()) list.push({ code: 'demo', label: 'ডেমো পেমেন্ট (শুধু ডেভেলপমেন্ট)', auto: true });
  return list;
}

// Public: plans for the pricing page.
r.get('/plans', asyncH(async (_req, res) => {
  res.json({
    plans: await query('SELECT * FROM plans WHERE is_active=1 ORDER BY sort_order'),
    free_limits: FREE_LIMITS, trial_days: TRIAL_DAYS, methods: methods().map(({ number, ...m }) => m),
  });
}));

// bKash redirects the browser here after the customer finishes (or abandons) payment.
r.get('/bkash/callback', asyncH(async (req, res) => {
  const { paymentID, status } = req.query;
  const p = paymentID ? await one(`SELECT * FROM payments WHERE gateway_payment_id=? AND method='bkash_gateway'`, [paymentID]) : null;
  const back = (s) => res.redirect(`${clientUrl()}/app/billing?payment=${s}`);
  if (!p) return back('failed');
  if (p.status === 'paid') return back('success');
  if (status !== 'success') {
    await query(`UPDATE payments SET status=? WHERE id=? AND status='pending'`, [status === 'cancel' ? 'cancelled' : 'failed', p.id]);
    return back(status === 'cancel' ? 'cancelled' : 'failed');
  }
  try {
    const d = await bkashExecute(paymentID);
    if (d.transactionStatus === 'Completed' && Number(d.amount) >= p.amount_bdt) {
      await markPaidAndActivate(p.id, { trxId: d.trxID, raw: d });
      return back('success');
    }
    await query(`UPDATE payments SET status='failed', raw=? WHERE id=?`, [JSON.stringify(d), p.id]);
    return back('failed');
  } catch (e) {
    console.error('bKash execute error:', e.message);
    return back('failed');
  }
}));

r.use(auth);

r.get('/me', asyncH(async (req, res) => {
  const access = await getAccess(req.user);
  const payments = await query(
    `SELECT p.id, p.plan_code, COALESCE(pl.name_bn, CONCAT('🛒 ', pr.title)) plan_name, p.amount_bdt, p.method, p.status, p.trx_id, p.admin_note, p.created_at, p.paid_at
       FROM payments p LEFT JOIN plans pl ON pl.code=p.plan_code LEFT JOIN products pr ON pr.id=p.product_id WHERE p.user_id=? ORDER BY p.id DESC LIMIT 30`, [req.user.id]);
  const subs = await query(
    `SELECT s.plan_code, pl.name_bn plan_name, s.starts_at, s.ends_at, s.status FROM subscriptions s JOIN plans pl ON pl.code=s.plan_code
      WHERE s.user_id=? ORDER BY s.ends_at DESC LIMIT 10`, [req.user.id]);
  const usage = access.pro ? null : {
    adaptive: await usedToday(req.user.id, 'adaptive'), mock: await usedToday(req.user.id, 'mock'),
    revision: await usedToday(req.user.id, 'revision'), coach: await coachUsedToday(req.user.id),
  };
  res.json({ access, payments, subscriptions: subs, usage, free_limits: FREE_LIMITS, methods: methods() });
}));

r.post('/checkout', asyncH(async (req, res) => {
  const { plan: code, method } = req.body;
  let plan;
  let productId = null;
  if (req.body.product_id) {
    // Marketplace item: priced by its creator, paid through the same rails.
    const prod = await one(`SELECT * FROM products WHERE id=? AND status='published' AND price_bdt>0`, [req.body.product_id]);
    if (!prod) throw new HttpError(400, 'পণ্যটি পাওয়া যায়নি');
    if (await one(`SELECT 1 x FROM purchases WHERE user_id=? AND product_id=? AND status='active'`, [req.user.id, prod.id])) throw new HttpError(409, 'আপনি এটি আগেই কিনেছেন');
    plan = { code: 'product', price_bdt: prod.price_bdt };
    productId = prod.id;
  } else plan = await one('SELECT * FROM plans WHERE code=? AND is_active=1', [code]);
  if (!plan) throw new HttpError(400, 'প্যাকেজ পাওয়া যায়নি');
  if (!methods().some((m) => m.code === method)) throw new HttpError(400, 'এই পেমেন্ট পদ্ধতি এখন চালু নেই');

  if (method === 'demo') {
    const ins = await query(`INSERT INTO payments (user_id, plan_code, product_id, amount_bdt, method, note) VALUES (?,?,?,?,?,?)`, [req.user.id, plan.code, productId, plan.price_bdt, 'demo', 'ডেমো']);
    await markPaidAndActivate(ins.insertId, { trxId: `DEMO${ins.insertId}` });
    return res.json({ status: 'paid' });
  }

  if (method === 'bkash_gateway') {
    const ins = await query(`INSERT INTO payments (user_id, plan_code, product_id, amount_bdt, method) VALUES (?,?,?,?,?)`, [req.user.id, plan.code, productId, plan.price_bdt, method]);
    const d = await bkashCreate({ amount: plan.price_bdt, invoice: `ARH-${ins.insertId}`, payer: String(req.user.phone || req.user.id), callbackURL: `${apiUrl()}/api/billing/bkash/callback` });
    await query('UPDATE payments SET gateway_payment_id=? WHERE id=?', [d.paymentID, ins.insertId]);
    return res.json({ status: 'redirect', url: d.bkashURL });
  }

  // Manual Send Money: the student submits the transaction ID, an admin verifies it against the statement.
  const trx = String(req.body.trx_id || '').trim().toUpperCase();
  const sender = String(req.body.sender_number || '').replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d)).replace(/\D/g, '');
  if (!/^[A-Z0-9]{8,12}$/.test(trx)) throw new HttpError(400, 'সঠিক ট্রানজেকশন আইডি (TrxID) দিন — ৮-১২ অক্ষরের ইংরেজি অক্ষর/সংখ্যা');
  if (!/^01\d{9}$/.test(sender)) throw new HttpError(400, 'যে নম্বর থেকে টাকা পাঠিয়েছেন তা দিন (০১XXXXXXXXX)');
  const dup = await one('SELECT id FROM payments WHERE method=? AND trx_id=?', [method, trx]);
  if (dup) throw new HttpError(409, 'এই ট্রানজেকশন আইডি আগেই জমা দেওয়া হয়েছে');
  await query(`INSERT INTO payments (user_id, plan_code, product_id, amount_bdt, method, trx_id, sender_number) VALUES (?,?,?,?,?,?,?)`,
    [req.user.id, plan.code, productId, plan.price_bdt, method, trx, sender]);
  res.json({ status: 'pending' });
}));

export default r;
