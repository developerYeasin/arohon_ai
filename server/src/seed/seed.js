// Seeds exams, subjects, topics, sample questions, current affairs, demo accounts and live exams.
// Usage: npm run seed            (skips if content already exists)
//        npm run seed -- --fresh (DROPS all tables first — destroys all data)
import bcrypt from 'bcryptjs';
import { pool, query, one } from '../db.js';
import { migrate } from '../migrate.js';
import { createTest, pickMock } from '../services/engine.js';
import { ensurePlans, TRIAL_DAYS } from '../services/billing.js';
import { dhakaToday } from '../services/util.js';
import { subjects, exams, questions, currentAffairs } from './data.js';
import { seedPrep } from './seed-prep.js';

const TABLES = ['ama_votes', 'ama_questions', 'ama_sessions', 'topper_stories', 'creator_payouts', 'product_reviews', 'purchases', 'product_questions', 'products', 'creator_profiles', 'battle_answers', 'battles', 'group_assignments', 'group_posts', 'group_members', 'study_groups', 'viva_answers', 'viva_sessions', 'viva_questions', 'peer_reviews', 'written_submissions', 'written_prompts', 'user_badges', 'otp_codes', 'subscriptions', 'payments', 'plans', 'coach_messages', 'discussion_votes', 'discussions', 'question_reports', 'bookmarks', 'daily_missions', 'review_items',
  'attempt_answers', 'attempts', 'test_questions', 'tests', 'question_versions', 'questions', 'current_affairs', 'topics',
  'exam_subjects', 'subjects', 'exams', 'users'];

const SOURCE = 'নমুনা প্রশ্ন — আরোহণ কনটেন্ট টিম';

async function insertQuestion(subjectId, topicId, row, extra = {}) {
  const [body, a, b, c, d, correct, explanation, difficulty] = row;
  const ins = await query('INSERT INTO questions SET ?', [{ subject_id: subjectId, topic_id: topicId, body, option_a: a, option_b: b, option_c: c, option_d: d,
    correct_option: correct, explanation, difficulty, source: SOURCE, last_verified_at: dhakaToday(), ...extra }]);
  await query('INSERT INTO question_versions (question_id, version, snapshot, change_note) VALUES (?,1,?,?)',
    [ins.insertId, JSON.stringify({ body, a, b, c, d, correct }), 'প্রাথমিক সংস্করণ']);
}

async function main() {
  if (process.argv.includes('--fresh')) {
    await query('SET FOREIGN_KEY_CHECKS=0');
    for (const t of TABLES) await query(`DROP TABLE IF EXISTS ${t}`);
    await query('SET FOREIGN_KEY_CHECKS=1');
    console.log('• Dropped existing tables');
  }
  await migrate();
  await ensurePlans();
  if ((await one('SELECT COUNT(*) n FROM exams')).n > 0) {
    console.log('Content already seeded. Use `npm run seed -- --fresh` to wipe and reseed.');
    return;
  }

  const subjectId = {};
  for (const s of subjects) subjectId[s.slug] = (await query('INSERT INTO subjects SET ?', [s])).insertId;

  for (const [i, e] of exams.entries()) {
    const { subjects: dist, ...exam } = e;
    const id = (await query('INSERT INTO exams SET ?', [{ ...exam, sort_order: i }])).insertId;
    for (const [slug, n] of Object.entries(dist)) await query('INSERT INTO exam_subjects VALUES (?,?,?)', [id, subjectId[slug], n]);
  }

  let qCount = 0;
  for (const [slug, topics] of Object.entries(questions)) {
    for (const [topicName, rows] of Object.entries(topics)) {
      const topicId = (await query('INSERT INTO topics (subject_id, name_bn) VALUES (?,?)', [subjectId[slug], topicName])).insertId;
      for (const row of rows) { await insertQuestion(subjectId[slug], topicId, row); qCount++; }
    }
  }

  // Current affairs questions live under International/Bangladesh affairs → "সাম্প্রতিক বিষয়াবলি".
  const caTopicIntl = (await query('INSERT INTO topics (subject_id, name_bn) VALUES (?,?)', [subjectId['intl-affairs'], 'সাম্প্রতিক আন্তর্জাতিক'])).insertId;
  const caTopicBd = (await query('INSERT INTO topics (subject_id, name_bn) VALUES (?,?)', [subjectId['bd-affairs'], 'সাম্প্রতিক বাংলাদেশ'])).insertId;
  for (const ca of currentAffairs) {
    const { questions: qs, key_facts, ...rest } = ca;
    const caId = (await query('INSERT INTO current_affairs SET ?', [{ ...rest, key_facts: JSON.stringify(key_facts) }])).insertId;
    const isBd = ca.category === 'বাংলাদেশ';
    for (const row of qs) {
      await insertQuestion(isBd ? subjectId['bd-affairs'] : subjectId['intl-affairs'], isBd ? caTopicBd : caTopicIntl, row, { current_affair_id: caId });
      qCount++;
    }
  }

  const bcs = await one(`SELECT * FROM exams WHERE code='bcs-preli'`);
  const du = await one(`SELECT * FROM exams WHERE code='du-science'`);
  const users = [
    { name: 'অ্যাডমিন', email: process.env.SEED_ADMIN_EMAIL || 'admin@arohon.ai', password: process.env.SEED_ADMIN_PASSWORD || 'Admin@123', role: 'admin', track: 'job', target_exam_id: bcs.id },
    { name: 'শিক্ষক (ডেমো)', email: process.env.SEED_TEACHER_EMAIL || 'teacher@arohon.ai', password: process.env.SEED_TEACHER_PASSWORD || 'Teacher@123', role: 'teacher', track: 'job', target_exam_id: bcs.id, institution: 'রাজশাহী বিশ্ববিদ্যালয়', district: 'রাজশাহী' },
    { name: 'ডেমো শিক্ষার্থী', email: process.env.SEED_STUDENT_EMAIL || 'student@arohon.ai', password: process.env.SEED_STUDENT_PASSWORD || 'Student@123', role: 'student', track: 'job', target_exam_id: bcs.id, institution: 'রাজশাহী বিশ্ববিদ্যালয়', district: 'রাজশাহী',
      trial_ends_at: new Date(Date.now() + TRIAL_DAYS * 86400e3).toISOString().slice(0, 19).replace('T', ' ') },
    { name: 'ফ্রি শিক্ষার্থী (ডেমো)', email: process.env.SEED_FREE_EMAIL || 'free@arohon.ai', password: process.env.SEED_FREE_PASSWORD || 'Free@123', role: 'student', track: 'admission', target_exam_id: du.id, district: 'ঢাকা' },
  ];
  let adminId = null;
  for (const { password, ...u } of users) {
    const id = (await query('INSERT INTO users SET ?', [{ ...u, password_hash: await bcrypt.hash(password, 10) }])).insertId;
    if (u.role === 'admin') adminId = id;
  }

  // One live exam open now (for a week) and one scheduled for tomorrow 8 PM Dhaka time.
  const fmt = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
  const now = new Date();
  const liveNow = await pickMock(adminId, bcs, 50);
  await createTest({ title: 'বিসিএস সাপ্তাহিক লাইভ মডেল টেস্ট — ৫০ নম্বর', kind: 'live', track: 'job', examId: bcs.id, questionIds: liveNow,
    durationSec: 30 * 60, negativeMark: 0.5, isPublic: true, startsAt: fmt(new Date(now.getTime() - 3600e3)), endsAt: fmt(new Date(now.getTime() + 7 * 86400e3)), userId: adminId });
  const tomorrow8pm = new Date(`${dhakaToday(1)}T20:00:00+06:00`);
  await createTest({ title: 'ঢাবি বিজ্ঞান ইউনিট লাইভ এক্সাম', kind: 'live', track: 'admission', examId: du.id, questionIds: await pickMock(adminId, du, 40),
    durationSec: 30 * 60, negativeMark: 0.25, isPublic: true, startsAt: fmt(tomorrow8pm), endsAt: fmt(new Date(tomorrow8pm.getTime() + 60 * 60e3)), userId: adminId });

  await seedPrep();
  console.log(`✔ Seeded ${subjects.length} subjects, ${exams.length} exams, ${qCount} questions, ${currentAffairs.length} current-affairs items`);
  console.log('  Demo logins: see SEED_* in server/.env');
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => pool.end());
