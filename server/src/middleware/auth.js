import jwt from 'jsonwebtoken';
import { one } from '../db.js';

export const sign = (user) => jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '30d' });

async function load(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return null;
  try {
    const { id } = jwt.verify(token, process.env.JWT_SECRET);
    return await one('SELECT * FROM users WHERE id=?', [id]);
  } catch {
    return null;
  }
}

export async function auth(req, res, next) {
  const user = await load(req);
  if (!user) return res.status(401).json({ error: 'লগইন করুন' });
  req.user = user;
  next();
}

export async function optionalAuth(req, _res, next) {
  req.user = await load(req);
  next();
}

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : res.status(403).json({ error: 'অনুমতি নেই' });

export function publicUser(u) {
  const { password_hash, ...rest } = u;
  return rest;
}
