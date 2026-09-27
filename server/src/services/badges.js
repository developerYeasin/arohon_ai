// Achievements reward real preparation behaviour (consistency, accuracy, mastery, helping others),
// never screen time. Each rule is a single cheap query run after a test is submitted.
import { query, one } from '../db.js';

export const BADGES = {
  first_test:   { icon: '🚀', bn: 'যাত্রা শুরু', desc: 'প্রথম টেস্ট সম্পন্ন' },
  streak_3:     { icon: '🔥', bn: 'তিন দিনের ধারা', desc: 'টানা ৩ দিন অনুশীলন' },
  streak_7:     { icon: '🔥', bn: 'সাপ্তাহিক ধারাবাহিকতা', desc: 'টানা ৭ দিন অনুশীলন' },
  streak_30:    { icon: '🏔️', bn: 'এক মাসের অধ্যবসায়', desc: 'টানা ৩০ দিন অনুশীলন' },
  q_100:        { icon: '📘', bn: '১০০ প্রশ্ন', desc: '১০০টি প্রশ্নের উত্তর' },
  q_500:        { icon: '📗', bn: '৫০০ প্রশ্ন', desc: '৫০০টি প্রশ্নের উত্তর' },
  q_1000:       { icon: '📚', bn: '১০০০ প্রশ্ন', desc: '১০০০টি প্রশ্নের উত্তর' },
  q_5000:       { icon: '🏛️', bn: '৫০০০ প্রশ্ন', desc: '৫০০০টি প্রশ্নের উত্তর' },
  sharpshooter: { icon: '🎯', bn: 'নির্ভুল নিশানা', desc: '২০+ প্রশ্নের টেস্টে ৯০%+ নির্ভুলতা' },
  full_mock:    { icon: '🏛️', bn: 'পূর্ণাঙ্গ পরীক্ষার্থী', desc: 'প্রথম পূর্ণাঙ্গ মডেল টেস্ট সম্পন্ন' },
  live_first:   { icon: '🔴', bn: 'লাইভ প্রতিযোগী', desc: 'প্রথম লাইভ এক্সামে অংশগ্রহণ' },
  mastered_10:  { icon: '🧠', bn: 'ভুল থেকে শেখা', desc: 'আগে ভুল করা ১০টি প্রশ্ন আয়ত্তে' },
  mastered_50:  { icon: '🧠', bn: 'ভুলের বিজয়ী', desc: 'আগে ভুল করা ৫০টি প্রশ্ন আয়ত্তে' },
  improver:     { icon: '📈', bn: 'উন্নতির ধারা', desc: 'এক সপ্তাহে নির্ভুলতা ১০+ পয়েন্ট বেড়েছে' },
  helper:       { icon: '🤝', bn: 'সহপাঠীর শিক্ষক', desc: 'আপনার ৫টি ব্যাখ্যা অন্যদের কাজে লেগেছে' },
  guardian:     { icon: '🛡️', bn: 'মান রক্ষক', desc: 'আপনার রিপোর্টে একটি প্রশ্ন সংশোধিত হয়েছে' },
};

export async function evaluateBadges(userId, { test, attempt } = {}) {
  const have = new Set((await query('SELECT code FROM user_badges WHERE user_id=?', [userId])).map((r) => r.code));
  const earn = [];
  const add = (code, cond) => { if (cond && !have.has(code)) earn.push(code); };

  const u = await one('SELECT streak FROM users WHERE id=?', [userId]);
  const answered = (await one('SELECT COUNT(*) n FROM attempt_answers WHERE user_id=? AND selected_option IS NOT NULL', [userId])).n;
  add('first_test', true);
  add('streak_3', u.streak >= 3); add('streak_7', u.streak >= 7); add('streak_30', u.streak >= 30);
  add('q_100', answered >= 100); add('q_500', answered >= 500); add('q_1000', answered >= 1000); add('q_5000', answered >= 5000);
  if (attempt && attempt.total >= 20) add('sharpshooter', attempt.correct / attempt.total >= 0.9);
  if (test?.kind === 'live') add('live_first', true);
  if (test?.kind === 'mock' && test.exam_id) {
    const e = await one('SELECT total_questions FROM exams WHERE id=?', [test.exam_id]);
    add('full_mock', e && attempt?.total >= e.total_questions);
  }
  if (!have.has('mastered_50')) {
    const m = (await one('SELECT COUNT(*) n FROM review_items WHERE user_id=? AND mastered=1', [userId])).n;
    add('mastered_10', m >= 10); add('mastered_50', m >= 50);
  }
  if (!have.has('improver')) {
    const w = await one(
      `SELECT SUM(CASE WHEN created_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY THEN is_correct END) c1,
              SUM(CASE WHEN created_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY THEN 1 END) n1,
              SUM(CASE WHEN created_at < UTC_TIMESTAMP() - INTERVAL 7 DAY AND created_at >= UTC_TIMESTAMP() - INTERVAL 14 DAY THEN is_correct END) c0,
              SUM(CASE WHEN created_at < UTC_TIMESTAMP() - INTERVAL 7 DAY AND created_at >= UTC_TIMESTAMP() - INTERVAL 14 DAY THEN 1 END) n0
         FROM attempt_answers WHERE user_id=? AND selected_option IS NOT NULL`, [userId]);
    add('improver', w.n1 >= 50 && w.n0 >= 50 && (100 * w.c1) / w.n1 - (100 * w.c0) / w.n0 >= 10);
  }
  if (!have.has('helper')) add('helper', (await one('SELECT COUNT(*) n FROM discussions WHERE user_id=? AND (score>=1 OR is_verified=1)', [userId])).n >= 5);
  if (!have.has('guardian')) add('guardian', (await one(`SELECT COUNT(*) n FROM question_reports WHERE user_id=? AND status='fixed'`, [userId])).n >= 1);

  if (earn.length) await query('INSERT IGNORE INTO user_badges (user_id, code) VALUES ?', [earn.map((c) => [userId, c])]);
  return earn;
}

export async function listBadges(userId) {
  const rows = await query('SELECT code, earned_at, seen FROM user_badges WHERE user_id=?', [userId]);
  const got = new Map(rows.map((r) => [r.code, r]));
  return Object.entries(BADGES).map(([code, b]) => ({ code, ...b, earned_at: got.get(code)?.earned_at || null, unseen: got.get(code)?.seen === 0 }));
}
