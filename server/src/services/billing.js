// Plans, access tiers, free-tier quotas, subscription activation and the bKash gateway client.
import { query, one, tx } from '../db.js';
import { dhakaToday, HttpError, toBn } from './util.js';

export const DEFAULT_PLANS = [
  { code: 'pass_1m', name_bn: 'এক্সাম পাস — ১ মাস', price_bdt: 99, duration_days: 30, sort_order: 1, highlight: null },
  { code: 'pass_3m', name_bn: 'এক্সাম পাস — ৩ মাস', price_bdt: 249, duration_days: 90, sort_order: 2, highlight: 'সবচেয়ে জনপ্রিয়' },
  { code: 'pass_6m', name_bn: 'এক্সাম পাস — ৬ মাস', price_bdt: 449, duration_days: 180, sort_order: 3, highlight: null },
  { code: 'pass_12m', name_bn: 'এক্সাম পাস — ১ বছর', price_bdt: 799, duration_days: 365, sort_order: 4, highlight: 'সবচেয়ে সাশ্রয়ী' },
  // Not sold: granted when someone you invited completes their first test.
  { code: 'referral_7d', name_bn: 'রেফারেল বোনাস — ৭ দিন', price_bdt: 0, duration_days: 7, sort_order: 99, highlight: null, is_active: 0 },
];
export const TRIAL_DAYS = 7;
export const CREATOR_SHARE = 0.7; // creators keep 70% of each sale

// Free tier: enough to build a habit, not enough to replace the pass.
export const FREE_LIMITS = { adaptive_per_day: 2, mock_per_day: 1, mock_max_questions: 25, revision_per_day: 1, revision_max_questions: 10, coach_per_day: 3 };

export async function ensurePlans() {
  for (const p of DEFAULT_PLANS) await query('INSERT IGNORE INTO plans SET ?', [p]);
}

export async function getAccess(user) {
  if (['admin', 'teacher'].includes(user.role)) return { tier: 'staff', pro: true, ai_coach: true, until: null };
  const sub = await one(
    `SELECT s.*, p.name_bn, p.includes_ai_coach FROM subscriptions s JOIN plans p ON p.code=s.plan_code
      WHERE s.user_id=? AND s.status='active' AND s.ends_at > UTC_TIMESTAMP() ORDER BY s.ends_at DESC LIMIT 1`, [user.id]);
  if (sub) return { tier: 'pro', pro: true, ai_coach: !!sub.includes_ai_coach, until: sub.ends_at, plan: sub.plan_code, plan_name: sub.name_bn };
  if (user.trial_ends_at && new Date(user.trial_ends_at) > new Date()) return { tier: 'trial', pro: true, ai_coach: true, until: user.trial_ends_at };
  return { tier: 'free', pro: false, ai_coach: false, until: null, limits: FREE_LIMITS };
}

// UTC timestamp for 00:00 today in Dhaka.
const dhakaDayStartUtc = () => new Date(`${dhakaToday()}T00:00:00+06:00`).toISOString().slice(0, 19).replace('T', ' ');

export async function usedToday(userId, kind) {
  const r = await one(
    `SELECT COUNT(*) n FROM tests WHERE created_by=? AND kind=? AND created_at >= ?
        AND (meta IS NULL OR JSON_EXTRACT(meta, '$.mission') IS NULL)`, [userId, kind, dhakaDayStartUtc()]);
  return r.n;
}

export async function coachUsedToday(userId) {
  return (await one(`SELECT COUNT(*) n FROM coach_messages WHERE user_id=? AND role='user' AND created_at >= ?`, [userId, dhakaDayStartUtc()])).n;
}

export const upgradeError = (msg) => new HttpError(402, msg, 'upgrade_required');

export async function requirePro(user, what) {
  const access = await getAccess(user);
  if (!access.pro) throw upgradeError(`${what} এক্সাম পাসের ফিচার। আপগ্রেড করে আনলক করুন।`);
  return access;
}

/** Throws 402 when a free user has used today's allowance for this kind of test. */
export async function checkQuota(user, kind, limit, label) {
  const access = await getAccess(user);
  if (access.pro) return access;
  if ((await usedToday(user.id, kind)) >= limit) {
    throw upgradeError(`ফ্রি প্যাকেজে দিনে ${label} ${toBn(limit)}টি। আগামীকাল আবার পাবেন, অথবা এক্সাম পাস নিয়ে সীমাহীন ব্যবহার করুন।`);
  }
  return access;
}

// ---------- Activation ----------
export async function markPaidAndActivate(paymentId, { trxId, raw, reviewerId } = {}) {
  return tx(async (q) => {
    const [p] = await q('SELECT * FROM payments WHERE id=? FOR UPDATE', [paymentId]);
    if (!p) throw new HttpError(404, 'পেমেন্ট পাওয়া যায়নি');
    if (p.status === 'paid') return p; // idempotent: callbacks can arrive twice
    if (p.product_id) {
      // Marketplace purchase: record ownership and the creator's revenue share.
      await q(`UPDATE payments SET status='paid', paid_at=UTC_TIMESTAMP(), trx_id=COALESCE(?, trx_id), raw=COALESCE(?, raw), reviewed_by=COALESCE(?, reviewed_by) WHERE id=?`,
        [trxId || null, raw ? JSON.stringify(raw) : null, reviewerId || null, p.id]);
      await q(`INSERT INTO purchases (user_id, product_id, payment_id, price_bdt, creator_share_bdt) VALUES (?,?,?,?,?)
               ON DUPLICATE KEY UPDATE status='active', payment_id=VALUES(payment_id)`, [p.user_id, p.product_id, p.id, p.amount_bdt, p.amount_bdt * CREATOR_SHARE]);
      await q('UPDATE products SET sales=sales+1 WHERE id=?', [p.product_id]);
      return { ...p, status: 'paid' };
    }
    const [plan] = await q('SELECT * FROM plans WHERE code=?', [p.plan_code]);
    // Stack on top of any remaining time so renewing early never loses days.
    const [cur] = await q(`SELECT MAX(ends_at) e FROM subscriptions WHERE user_id=? AND status='active' AND ends_at > UTC_TIMESTAMP()`, [p.user_id]);
    const start = cur?.e ? new Date(cur.e) : new Date();
    const end = new Date(start.getTime() + plan.duration_days * 86400000);
    const fmt = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
    await q(`UPDATE payments SET status='paid', paid_at=UTC_TIMESTAMP(), trx_id=COALESCE(?, trx_id), raw=COALESCE(?, raw), reviewed_by=COALESCE(?, reviewed_by) WHERE id=?`,
      [trxId || null, raw ? JSON.stringify(raw) : null, reviewerId || null, p.id]);
    await q('INSERT INTO subscriptions (user_id, plan_code, payment_id, starts_at, ends_at) VALUES (?,?,?,?,?)', [p.user_id, p.plan_code, p.id, fmt(start), fmt(end)]);
    return { ...p, status: 'paid' };
  });
}

// Referral reward: 7 days of pass for the referrer, stacked on any time they already have.
export const REFERRAL_BONUS_DAYS = 7;
export async function rewardReferral(refereeId) {
  const u = await one('SELECT referred_by, referral_rewarded FROM users WHERE id=?', [refereeId]);
  if (!u?.referred_by || u.referral_rewarded) return;
  const claimed = await query('UPDATE users SET referral_rewarded=1 WHERE id=? AND referral_rewarded=0', [refereeId]);
  if (!claimed.affectedRows) return;
  const cur = await one(`SELECT GREATEST(UTC_TIMESTAMP(), COALESCE(MAX(ends_at), UTC_TIMESTAMP())) s FROM subscriptions WHERE user_id=? AND status='active'`, [u.referred_by]);
  const referrer = await one('SELECT trial_ends_at FROM users WHERE id=?', [u.referred_by]);
  let start = new Date(cur.s);
  if (referrer.trial_ends_at && new Date(referrer.trial_ends_at) > start) start = new Date(referrer.trial_ends_at);
  const end = new Date(start.getTime() + REFERRAL_BONUS_DAYS * 86400000);
  const fmt = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
  await query('INSERT INTO subscriptions (user_id, plan_code, starts_at, ends_at) VALUES (?,?,?,?)', [u.referred_by, 'referral_7d', fmt(start), fmt(end)]);
}

export async function refundPayment(paymentId, reviewerId, note) {
  await tx(async (q) => {
    await q(`UPDATE payments SET status='refunded', admin_note=?, reviewed_by=? WHERE id=? AND status='paid'`, [note || null, reviewerId, paymentId]);
    await q(`UPDATE subscriptions SET status='refunded' WHERE payment_id=?`, [paymentId]);
    await q(`UPDATE purchases SET status='refunded' WHERE payment_id=?`, [paymentId]);
  });
}

// ---------- bKash Tokenized Checkout ----------
const bk = () => ({
  base: process.env.BKASH_BASE_URL, appKey: process.env.BKASH_APP_KEY, appSecret: process.env.BKASH_APP_SECRET,
  username: process.env.BKASH_USERNAME, password: process.env.BKASH_PASSWORD,
});
export const bkashEnabled = () => Object.values(bk()).every(Boolean);

let tokenCache = { token: null, exp: 0 };
async function bkashToken() {
  if (tokenCache.token && Date.now() < tokenCache.exp) return tokenCache.token;
  const c = bk();
  const res = await fetch(`${c.base}/tokenized/checkout/token/grant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', username: c.username, password: c.password },
    body: JSON.stringify({ app_key: c.appKey, app_secret: c.appSecret }),
  });
  const d = await res.json();
  if (!d.id_token) throw new HttpError(502, `bKash টোকেন পাওয়া যায়নি: ${d.statusMessage || d.msg || res.status}`);
  tokenCache = { token: d.id_token, exp: Date.now() + 50 * 60 * 1000 }; // tokens live 1h
  return d.id_token;
}

async function bkashCall(path, body) {
  const c = bk();
  const res = await fetch(`${c.base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: await bkashToken(), 'X-App-Key': c.appKey },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function bkashCreate({ amount, invoice, payer, callbackURL }) {
  const d = await bkashCall('/tokenized/checkout/create', {
    mode: '0011', payerReference: payer, callbackURL, amount: String(amount), currency: 'BDT', intent: 'sale', merchantInvoiceNumber: invoice,
  });
  if (!d.bkashURL || !d.paymentID) throw new HttpError(502, `bKash পেমেন্ট শুরু করা যায়নি: ${d.statusMessage || 'অজানা ত্রুটি'}`);
  return d;
}

export async function bkashExecute(paymentID) {
  let d = await bkashCall('/tokenized/checkout/execute', { paymentID });
  // If execute timed out or was already run, ask for the authoritative status.
  if (!d.transactionStatus) d = await bkashCall('/tokenized/checkout/payment/status', { paymentID });
  return d;
}

// ---------- Free-tier redaction ----------
// Free users see enough of each report to understand its value (a teaser), never nothing.
export function redactReadiness(r, access) {
  if (!r || access.pro) return r;
  return {
    ...r,
    locked: ['projected_marks', 'dimensions', 'risks', 'mistake_mix', 'weak_topics'],
    projected_marks: null,
    dimensions: { subject_mastery: r.dimensions.subject_mastery, accuracy: r.dimensions.accuracy, time_management: null, consistency: null, retention: null, simulation: null },
    risks: r.risks.slice(0, 1),
    hidden_risks: Math.max(0, r.risks.length - 1),
    mistake_mix: [],
    weak_topics: r.weak_topics.slice(0, 1),
    hidden_weak_topics: Math.max(0, r.weak_topics.length - 1),
  };
}

export function redactReport(rep, access) {
  if (access.pro) return rep;
  return {
    ...rep,
    locked: ['insights', 'mistake_summary'],
    insights: rep.insights.slice(0, 2),
    hidden_insights: Math.max(0, rep.insights.length - 2),
    mistake_summary: rep.mistake_summary.map(({ remedy, ...m }) => ({ ...m, remedy: null })),
  };
}
