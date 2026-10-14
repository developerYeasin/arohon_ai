// Public website content: blog, job circulars, notices/routines, resources, FAQ, mentors, success stories,
// newsletter and contact forms. Reads are open; writes under /admin are staff-only.
import { Router } from 'express';
import { query, one } from '../db.js';
import { auth, optionalAuth, requireRole } from '../middleware/auth.js';
import { asyncH, HttpError, clamp } from '../services/util.js';

const r = Router();
const TYPES = ['blog', 'circular', 'notice', 'resource', 'video'];
const MSG_KINDS = ['contact', 'question', 'story', 'partnership'];
const KINDS = ['advisor', 'mentor', 'story'];
const LIST_COLS = 'id, type, slug, title, excerpt, category, cover_url, link_url, organization, deadline, published_at, views';

// Per-IP limit on the open forms so they can't be used to flood the inbox.
const hits = new Map();
const formLimited = (ip) => {
  const now = Date.now();
  const h = (hits.get(ip) || []).filter((t) => now - t < 10 * 60e3);
  h.push(now); hits.set(ip, h);
  return h.length > 8;
};

const slugify = (s) => String(s).trim().toLowerCase()
  .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 120) || 'post';

// ---------- Public reads ----------
r.get('/posts', asyncH(async (req, res) => {
  const { type, category, q } = req.query;
  if (type && !TYPES.includes(type)) throw new HttpError(400, 'অবৈধ ধরন');
  const limit = clamp(Number(req.query.limit) || 12, 1, 50);
  const page = Math.max(1, Number(req.query.page) || 1);
  const where = ['published=1', 'published_at <= UTC_TIMESTAMP()']; const vals = [];
  if (type) { where.push('type=?'); vals.push(type); }
  if (category) { where.push('category=?'); vals.push(category); }
  if (q) { where.push('(title LIKE ? OR excerpt LIKE ? OR organization LIKE ?)'); vals.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const w = where.join(' AND ');
  const rows = await query(`SELECT ${LIST_COLS} FROM site_posts WHERE ${w} ORDER BY published_at DESC, id DESC LIMIT ? OFFSET ?`, [...vals, limit, (page - 1) * limit]);
  const { n } = await one(`SELECT COUNT(*) n FROM site_posts WHERE ${w}`, vals);
  const cats = type ? (await query(`SELECT DISTINCT category FROM site_posts WHERE type=? AND published=1 AND category IS NOT NULL ORDER BY category`, [type])).map((c) => c.category) : [];
  res.json({ rows, total: n, page, pages: Math.max(1, Math.ceil(n / limit)), categories: cats });
}));

r.get('/posts/:type/:slug', asyncH(async (req, res) => {
  const p = await one('SELECT * FROM site_posts WHERE type=? AND slug=? AND published=1', [req.params.type, req.params.slug]);
  if (!p) throw new HttpError(404, 'পাওয়া যায়নি');
  await query('UPDATE site_posts SET views=views+1 WHERE id=?', [p.id]);
  const related = await query(`SELECT ${LIST_COLS} FROM site_posts WHERE type=? AND published=1 AND id<>? ORDER BY published_at DESC LIMIT 4`, [p.type, p.id]);
  res.json({ post: { ...p, views: p.views + 1 }, related });
}));

r.get('/faqs', asyncH(async (_req, res) => {
  res.json(await query('SELECT id, category, question, answer FROM site_faqs WHERE published=1 ORDER BY sort_order, id'));
}));

r.get('/people', asyncH(async (req, res) => {
  const { kind } = req.query;
  if (kind && !KINDS.includes(kind)) throw new HttpError(400, 'অবৈধ ধরন');
  res.json(await query(
    `SELECT id, kind, name, role_line, bio, photo_url, exam_tag FROM site_people WHERE published=1 ${kind ? 'AND kind=?' : ''} ORDER BY sort_order, id`,
    kind ? [kind] : []));
}));

// One search box for the whole site: posts plus target exams.
r.get('/search', asyncH(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ posts: [], exams: [] });
  const like = `%${q}%`;
  const posts = await query(`SELECT ${LIST_COLS} FROM site_posts WHERE published=1 AND (title LIKE ? OR excerpt LIKE ?) ORDER BY published_at DESC LIMIT 20`, [like, like]);
  const exams = await query('SELECT id, code, name_bn, track, description FROM exams WHERE name_bn LIKE ? OR name_en LIKE ? OR code LIKE ? LIMIT 8', [like, like, like]);
  res.json({ posts, exams });
}));

// ---------- Public forms ----------
r.post('/newsletter', asyncH(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) throw new HttpError(400, 'সঠিক ইমেইল দিন');
  if (formLimited(req.ip)) throw new HttpError(429, 'কিছুক্ষণ পর আবার চেষ্টা করুন');
  await query('INSERT IGNORE INTO newsletter_subscribers (email) VALUES (?)', [email]);
  res.json({ ok: true });
}));

r.post('/contact', optionalAuth, asyncH(async (req, res) => {
  const { kind = 'contact', name, contact, subject = null, topic = null, message } = req.body || {};
  if (!MSG_KINDS.includes(kind)) throw new HttpError(400, 'অবৈধ ধরন');
  if (!name?.trim() || !contact?.trim() || !message?.trim()) throw new HttpError(400, 'নাম, যোগাযোগের তথ্য ও বার্তা দিন');
  if (message.length > 5000) throw new HttpError(400, 'বার্তা অনেক বড়');
  if (formLimited(req.ip)) throw new HttpError(429, 'কিছুক্ষণ পর আবার চেষ্টা করুন');
  await query('INSERT INTO contact_messages (kind, name, contact, subject, topic, message, user_id) VALUES (?,?,?,?,?,?,?)',
    [kind, name.trim().slice(0, 120), contact.trim().slice(0, 160), subject?.slice(0, 255) || null, topic?.slice(0, 80) || null, message.trim(), req.user?.id || null]);
  res.json({ ok: true });
}));

// Answered mentor questions that staff chose to publish, so others can find them before asking.
r.get('/questions', asyncH(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const topic = String(req.query.topic || '').trim();
  const where = ["kind='question'", 'is_public=1', 'reply IS NOT NULL']; const vals = [];
  if (q) { where.push('(subject LIKE ? OR message LIKE ? OR reply LIKE ?)'); vals.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (topic) { where.push('topic=?'); vals.push(topic); }
  const rows = await query(`SELECT id, topic, subject, message, reply, created_at FROM contact_messages WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT 100`, vals);
  const topics = (await query("SELECT DISTINCT topic FROM contact_messages WHERE kind='question' AND is_public=1 AND reply IS NOT NULL AND topic IS NOT NULL ORDER BY topic")).map((t) => t.topic);
  res.json({ rows, topics });
}));

// Exam landing page: exam rules, subject-wise mark distribution and related notices/circulars.
r.get('/exam/:code', asyncH(async (req, res) => {
  const exam = await one('SELECT * FROM exams WHERE code=?', [req.params.code]);
  if (!exam) throw new HttpError(404, 'পরীক্ষা পাওয়া যায়নি');
  const subjects = await query(
    `SELECT s.id, s.name_bn, es.question_count,
            (SELECT COUNT(*) FROM questions q WHERE q.subject_id=s.id AND q.status='active') bank
       FROM exam_subjects es JOIN subjects s ON s.id=es.subject_id WHERE es.exam_id=? ORDER BY es.question_count DESC, s.id`, [exam.id]);
  const tags = [exam.name_bn, exam.name_en, exam.code].filter(Boolean);
  const posts = await query(
    `SELECT ${LIST_COLS} FROM site_posts WHERE published=1 AND published_at <= UTC_TIMESTAMP() AND type IN ('notice','circular','blog')
        AND (category IN (?) OR ${tags.map(() => 'title LIKE ?').join(' OR ')}) ORDER BY published_at DESC LIMIT 6`,
    [tags, ...tags.map((t) => `%${t}%`)]);
  res.json({ exam, subjects, posts });
}));

// Public live-exam routine: running and upcoming live tests for the next 30 days.
r.get('/routine', asyncH(async (req, res) => {
  const track = ['job', 'admission', 'academic'].includes(req.query.track) ? req.query.track : null;
  const rows = await query(
    `SELECT t.id, t.title, t.track, t.duration_sec, t.negative_mark, t.starts_at, t.ends_at, e.name_bn exam_name,
            (SELECT COUNT(*) FROM test_questions tq WHERE tq.test_id=t.id) questions
       FROM tests t LEFT JOIN exams e ON e.id=t.exam_id
      WHERE t.kind='live' AND t.ends_at > UTC_TIMESTAMP() AND t.starts_at < UTC_TIMESTAMP() + INTERVAL 30 DAY
        ${track ? 'AND (t.track IS NULL OR t.track=?)' : ''}
      ORDER BY t.starts_at LIMIT 200`, track ? [track] : []);
  res.json(rows.map((t) => ({ ...t, negative_mark: Number(t.negative_mark), running: new Date(t.starts_at) <= new Date() })));
}));

// The signed-in student's own questions to mentors, with replies.
r.get('/my-questions', auth, asyncH(async (req, res) => {
  res.json(await query('SELECT id, subject, message, status, reply, created_at FROM contact_messages WHERE user_id=? AND kind=\'question\' ORDER BY id DESC LIMIT 50', [req.user.id]));
}));

// ---------- Staff management ----------
const admin = Router();
admin.use(auth, requireRole('admin', 'teacher'));

const POST_FIELDS = ['type', 'slug', 'title', 'excerpt', 'body', 'category', 'cover_url', 'link_url', 'organization', 'deadline', 'published', 'published_at'];
const pick = (b, fields) => {
  const o = {};
  for (const k of fields) if (b[k] !== undefined) o[k] = b[k] === '' ? null : b[k];
  return o;
};
async function save(table, id, data, res) {
  const keys = Object.keys(data);
  if (!keys.length) throw new HttpError(400, 'কিছু পরিবর্তন নেই');
  if (id) await query(`UPDATE ${table} SET ${keys.map((k) => `${k}=?`).join(', ')} WHERE id=?`, [...keys.map((k) => data[k]), id]);
  else id = (await query(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, keys.map((k) => data[k]))).insertId;
  res.json(await one(`SELECT * FROM ${table} WHERE id=?`, [id]));
}

admin.get('/posts', asyncH(async (req, res) => {
  const { type } = req.query;
  res.json(await query(`SELECT ${LIST_COLS}, published FROM site_posts ${type ? 'WHERE type=?' : ''} ORDER BY id DESC LIMIT 200`, type ? [type] : []));
}));
admin.get('/posts/:id', asyncH(async (req, res) => res.json(await one('SELECT * FROM site_posts WHERE id=?', [req.params.id]))));
const savePost = asyncH(async (req, res) => {
  const d = pick(req.body || {}, POST_FIELDS);
  const id = req.params.id ? Number(req.params.id) : null;
  if (!id && (!d.type || !d.title)) throw new HttpError(400, 'ধরন ও শিরোনাম দিন');
  if (d.type && !TYPES.includes(d.type)) throw new HttpError(400, 'অবৈধ ধরন');
  if (!id && !d.slug) d.slug = slugify(d.title);
  if (d.slug) {
    d.slug = slugify(d.slug);
    const dup = await one('SELECT id FROM site_posts WHERE slug=? AND id<>?', [d.slug, id || 0]);
    if (dup) d.slug = `${d.slug}-${Date.now().toString(36)}`;
  }
  if (!id) d.created_by = req.user.id;
  await save('site_posts', id, d, res);
});
admin.post('/posts', savePost);
admin.put('/posts/:id', savePost);
admin.delete('/posts/:id', asyncH(async (req, res) => { await query('DELETE FROM site_posts WHERE id=?', [req.params.id]); res.json({ ok: true }); }));

admin.get('/faqs', asyncH(async (_req, res) => res.json(await query('SELECT * FROM site_faqs ORDER BY sort_order, id'))));
const saveFaq = asyncH(async (req, res) => {
  const d = pick(req.body || {}, ['category', 'question', 'answer', 'sort_order', 'published']);
  if (!req.params.id && (!d.question || !d.answer)) throw new HttpError(400, 'প্রশ্ন ও উত্তর দিন');
  await save('site_faqs', req.params.id ? Number(req.params.id) : null, d, res);
});
admin.post('/faqs', saveFaq);
admin.put('/faqs/:id', saveFaq);
admin.delete('/faqs/:id', asyncH(async (req, res) => { await query('DELETE FROM site_faqs WHERE id=?', [req.params.id]); res.json({ ok: true }); }));

admin.get('/people', asyncH(async (_req, res) => res.json(await query('SELECT * FROM site_people ORDER BY kind, sort_order, id'))));
const savePerson = asyncH(async (req, res) => {
  const d = pick(req.body || {}, ['kind', 'name', 'role_line', 'bio', 'photo_url', 'exam_tag', 'sort_order', 'published']);
  if (!req.params.id && (!d.kind || !d.name)) throw new HttpError(400, 'ধরন ও নাম দিন');
  if (d.kind && !KINDS.includes(d.kind)) throw new HttpError(400, 'অবৈধ ধরন');
  await save('site_people', req.params.id ? Number(req.params.id) : null, d, res);
});
admin.post('/people', savePerson);
admin.put('/people/:id', savePerson);
admin.delete('/people/:id', asyncH(async (req, res) => { await query('DELETE FROM site_people WHERE id=?', [req.params.id]); res.json({ ok: true }); }));

admin.get('/messages', asyncH(async (req, res) => {
  const status = ['new', 'answered', 'closed'].includes(req.query.status) ? req.query.status : null;
  res.json(await query(`SELECT * FROM contact_messages ${status ? 'WHERE status=?' : ''} ORDER BY id DESC LIMIT 200`, status ? [status] : []));
}));
admin.put('/messages/:id', asyncH(async (req, res) => {
  const d = pick(req.body || {}, ['status', 'reply', 'is_public', 'topic']);
  if (d.status && !['new', 'answered', 'closed'].includes(d.status)) throw new HttpError(400, 'অবৈধ স্ট্যাটাস');
  if (d.reply && !d.status) d.status = 'answered';
  await save('contact_messages', Number(req.params.id), d, res);
}));

admin.get('/subscribers', asyncH(async (_req, res) => res.json(await query('SELECT * FROM newsletter_subscribers ORDER BY id DESC LIMIT 1000'))));

r.use('/admin', admin);

export default r;
