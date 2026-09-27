import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { query, one } from '../db.js';
import { auth, sign, publicUser } from '../middleware/auth.js';
import { asyncH, HttpError, dhakaToday } from '../services/util.js';
import { getAccess, TRIAL_DAYS, REFERRAL_BONUS_DAYS } from '../services/billing.js';
import { sendEmail, sendSms, emailEnabled, smsEnabled } from '../services/notify.js';

// Simple in-memory brute-force guard: 10 failed logins per login ID per 15 minutes.
const failed = new Map();
const tooMany = (key) => { const f = failed.get(key); return f && f.n >= 10 && Date.now() - f.t < 15 * 60e3; };
const noteFail = (key) => { const f = failed.get(key); failed.set(key, f && Date.now() - f.t < 15 * 60e3 ? { n: f.n + 1, t: f.t } : { n: 1, t: Date.now() }); };

// Every user payload carries the access tier so the UI can show locks and trial status.
const withAccess = async (u) => ({ ...publicUser(u), access: await getAccess(u) });

const r = Router();
const TRACKS = ['academic', 'admission', 'job'];

r.post('/register', asyncH(async (req, res) => {
  const { name, email, phone, password, track = 'job', target_exam_id = null, district = null, institution = null, ref = null } = req.body || {};
  if (!name?.trim() || !password || password.length < 6) throw new HttpError(400, 'নাম এবং কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড দিন');
  if (!email && !phone) throw new HttpError(400, 'ইমেইল অথবা মোবাইল নম্বর দিন');
  if (!TRACKS.includes(track)) throw new HttpError(400, 'অবৈধ ট্র্যাক');
  const dup = await one('SELECT id FROM users WHERE (email IS NOT NULL AND email=?) OR (phone IS NOT NULL AND phone=?)', [email || null, phone || null]);
  if (dup) throw new HttpError(409, 'এই ইমেইল/মোবাইল দিয়ে ইতিমধ্যে অ্যাকাউন্ট আছে');
  const hash = await bcrypt.hash(password, 10);
  const referrer = ref ? await one('SELECT id FROM users WHERE referral_code=?', [String(ref).toUpperCase()]) : null;
  const ins = await query(
    `INSERT INTO users (name, email, phone, password_hash, track, target_exam_id, district, institution, referred_by, trial_ends_at)
     VALUES (?,?,?,?,?,?,?,?,?, UTC_TIMESTAMP() + INTERVAL ? DAY)`,
    // An invited student gets a longer trial (standard + referral bonus).
    [name.trim(), email || null, phone || null, hash, track, target_exam_id || null, district, institution, referrer?.id || null, TRIAL_DAYS + (referrer ? REFERRAL_BONUS_DAYS : 0)]);
  const user = await one('SELECT * FROM users WHERE id=?', [ins.insertId]);
  res.json({ token: sign(user), user: await withAccess(user) });
}));

r.post('/login', asyncH(async (req, res) => {
  const { login, password } = req.body || {};
  const key = String(login || '').toLowerCase();
  if (tooMany(key)) throw new HttpError(429, 'অনেকবার ভুল পাসওয়ার্ড — ১৫ মিনিট পর চেষ্টা করুন অথবা পাসওয়ার্ড রিসেট করুন');
  const user = await one('SELECT * FROM users WHERE email=? OR phone=?', [login, login]);
  if (!user || !(await bcrypt.compare(password || '', user.password_hash))) { noteFail(key); throw new HttpError(401, 'ইমেইল/মোবাইল অথবা পাসওয়ার্ড ভুল'); }
  failed.delete(key);
  res.json({ token: sign(user), user: await withAccess(user) });
}));

// ---------- Password reset by one-time code (email or SMS) ----------
const OTP_TTL_MIN = 10;
const OTP_MAX_ATTEMPTS = 5;

r.post('/forgot', asyncH(async (req, res) => {
  const login = String(req.body.login || '').trim();
  const user = login ? await one('SELECT * FROM users WHERE email=? OR phone=?', [login, login]) : null;
  // Same answer whether or not the account exists, so the endpoint can't be used to discover accounts.
  const generic = { ok: true, message: 'অ্যাকাউন্ট থাকলে একটি ৬ অঙ্কের কোড পাঠানো হয়েছে। কোডটি ১০ মিনিট কার্যকর থাকবে।' };
  if (!user) return res.json(generic);
  const recent = await one(`SELECT COUNT(*) n FROM otp_codes WHERE user_id=? AND created_at >= UTC_TIMESTAMP() - INTERVAL 1 MINUTE`, [user.id]);
  if (recent.n > 0) throw new HttpError(429, 'এক মিনিট পর আবার চেষ্টা করুন');
  const code = String(crypto.randomInt(100000, 1000000));
  const text = `আরোহণ পাসওয়ার্ড রিসেট কোড: ${code} (১০ মিনিট কার্যকর)। কাউকে এই কোড দেবেন না।`;
  let channel = 'dev';
  try {
    if (user.phone && login === user.phone && smsEnabled()) { await sendSms(user.phone, text); channel = 'sms'; }
    else if (user.email && emailEnabled()) { await sendEmail(user.email, 'আরোহণ — পাসওয়ার্ড রিসেট কোড', text); channel = 'email'; }
    else if (user.phone && smsEnabled()) { await sendSms(user.phone, text); channel = 'sms'; }
  } catch (e) {
    console.error('OTP delivery failed:', e.message);
    throw new HttpError(502, 'কোড পাঠানো যায়নি — কিছুক্ষণ পর আবার চেষ্টা করুন');
  }
  if (channel === 'dev' && process.env.NODE_ENV === 'production') throw new HttpError(503, 'এই মুহূর্তে কোড পাঠানোর ব্যবস্থা চালু নেই');
  await query(`INSERT INTO otp_codes (user_id, purpose, code_hash, channel, expires_at) VALUES (?,?,?,?, UTC_TIMESTAMP() + INTERVAL ? MINUTE)`,
    [user.id, 'reset_password', await bcrypt.hash(code, 8), channel, OTP_TTL_MIN]);
  // Development without an email/SMS provider: return the code so the flow can be tested.
  if (channel === 'dev') { console.log(`[dev] reset code for ${login}: ${code}`); return res.json({ ...generic, dev_code: code }); }
  res.json(generic);
}));

r.post('/reset', asyncH(async (req, res) => {
  const { login, code, password } = req.body || {};
  if (!password || password.length < 6) throw new HttpError(400, 'কমপক্ষে ৬ অক্ষরের নতুন পাসওয়ার্ড দিন');
  const user = await one('SELECT * FROM users WHERE email=? OR phone=?', [String(login || '').trim(), String(login || '').trim()]);
  const otp = user ? await one(
    `SELECT * FROM otp_codes WHERE user_id=? AND purpose='reset_password' AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()
      ORDER BY id DESC LIMIT 1`, [user.id]) : null;
  if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) throw new HttpError(400, 'কোডের মেয়াদ শেষ বা অবৈধ — নতুন কোড নিন');
  if (!(await bcrypt.compare(String(code || ''), otp.code_hash))) {
    await query('UPDATE otp_codes SET attempts=attempts+1 WHERE id=?', [otp.id]);
    throw new HttpError(400, 'কোড মেলেনি');
  }
  await query('UPDATE otp_codes SET used_at=UTC_TIMESTAMP() WHERE id=?', [otp.id]);
  await query('UPDATE users SET password_hash=? WHERE id=?', [await bcrypt.hash(password, 10), user.id]);
  res.json({ token: sign(user), user: await withAccess(user) });
}));

r.post('/change-password', auth, asyncH(async (req, res) => {
  const { current, password } = req.body || {};
  if (!(await bcrypt.compare(current || '', req.user.password_hash))) throw new HttpError(400, 'বর্তমান পাসওয়ার্ড ভুল');
  if (!password || password.length < 6) throw new HttpError(400, 'কমপক্ষে ৬ অক্ষরের নতুন পাসওয়ার্ড দিন');
  await query('UPDATE users SET password_hash=? WHERE id=?', [await bcrypt.hash(password, 10), req.user.id]);
  res.json({ ok: true });
}));

r.get('/me', auth, asyncH(async (req, res) => res.json({ user: await withAccess(req.user) })));

r.put('/me', auth, asyncH(async (req, res) => {
  const allowed = ['name', 'track', 'target_exam_id', 'exam_date', 'district', 'institution', 'daily_minutes', 'show_on_leaderboard'];
  const sets = []; const vals = [];
  for (const k of allowed) {
    if (req.body[k] === undefined) continue;
    if (k === 'track' && !TRACKS.includes(req.body[k])) throw new HttpError(400, 'অবৈধ ট্র্যাক');
    sets.push(`${k}=?`); vals.push(req.body[k] === '' ? null : req.body[k]);
  }
  if (req.body.target_exam_id) {
    const exam = await one('SELECT track FROM exams WHERE id=?', [req.body.target_exam_id]);
    if (!exam) throw new HttpError(400, 'পরীক্ষা পাওয়া যায়নি');
    if (!req.body.track) { sets.push('track=?'); vals.push(exam.track); }
  }
  if (sets.length) {
    await query(`UPDATE users SET ${sets.join(', ')} WHERE id=?`, [...vals, req.user.id]);
    // Target changed → today's mission should be rebuilt.
    if (req.body.target_exam_id || req.body.track) await query('DELETE FROM daily_missions WHERE user_id=? AND mission_date=?', [req.user.id, dhakaToday()]);
  }
  res.json({ user: await withAccess(await one('SELECT * FROM users WHERE id=?', [req.user.id])) });
}));

export default r;
