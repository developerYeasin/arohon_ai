// Weekly and long-range study planner. The week plan spreads study time across subjects in
// proportion to (exam weight × how far from ready), keeps daily revision, and schedules mocks;
// the long-range plan splits the time until the exam into phases.
import { query, one } from '../db.js';
import { readiness, getUserExam, dueReviewIds } from './engine.js';
import { dhakaToday, addDays, daysBetween, pct, toBn } from './util.js';

const WEEKDAY_BN = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];
const weekday = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();

// Bangladesh study weeks start on Saturday.
export function weekStart(today = dhakaToday()) {
  return addDays(today, -((weekday(today) + 1) % 7));
}

export async function weeklyGoal(user) {
  if (user.weekly_goal) return user.weekly_goal;
  const exam = await getUserExam(user);
  const perQ = (exam?.sec_per_question || 40) * 1.4; // include reading explanations
  return Math.max(50, Math.round(((user.daily_minutes * 60) / perQ) * 6 / 10) * 10);
}

export async function weekProgress(user) {
  const start = weekStart();
  const startUtc = new Date(`${start}T00:00:00+06:00`).toISOString().slice(0, 19).replace('T', ' ');
  const rows = await query(
    `SELECT DATE(CONVERT_TZ(created_at, '+00:00', '+06:00')) d, COUNT(*) n, SUM(is_correct) c
       FROM attempt_answers WHERE user_id=? AND created_at >= ? GROUP BY d`, [user.id, startUtc]);
  const byDay = new Map(rows.map((r) => [r.d, r]));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    const r = byDay.get(d);
    return { date: d, weekday: WEEKDAY_BN[weekday(d)], questions: r ? Number(r.n) : 0, accuracy: r ? pct(Number(r.c), Number(r.n)) : null };
  });
  const goal = await weeklyGoal(user);
  const done = days.reduce((a, d) => a + d.questions, 0);
  return { start, goal, done, percent: Math.min(100, pct(done, goal)), days };
}

export async function buildPlanner(user) {
  const today = dhakaToday();
  const [r, exam, due] = await Promise.all([readiness(user), getUserExam(user), dueReviewIds(user.id, 200)]);
  if (!r || !exam) return null;
  const examDate = user.exam_date || exam.next_exam_date;
  const daysLeft = examDate ? daysBetween(today, examDate) : null;
  const minutes = user.daily_minutes;

  // Priority = syllabus weight × distance from ready (+ a floor so strong subjects still get upkeep).
  const subjects = r.subjects.map((s) => ({ ...s, priority: s.questions * (1 - s.readiness / 100 + 0.15) }));
  const totalP = subjects.reduce((a, s) => a + s.priority, 0) || 1;
  const slotsPerDay = minutes >= 90 ? 2 : 1;
  const totalSlots = 7 * slotsPerDay;
  // Largest-remainder allocation of focus slots across subjects.
  const alloc = subjects.map((s) => ({ s, exact: (s.priority / totalP) * totalSlots }));
  alloc.forEach((a) => { a.n = Math.floor(a.exact); });
  let left = totalSlots - alloc.reduce((a, x) => a + x.n, 0);
  [...alloc].sort((a, b) => (b.exact - b.n) - (a.exact - a.n)).forEach((a) => { if (left > 0) { a.n++; left--; } });
  const queue = [];
  const pool = alloc.filter((a) => a.n > 0).sort((a, b) => b.n - a.n);
  while (pool.some((a) => a.n > 0)) for (const a of pool) if (a.n > 0) { queue.push(a.s); a.n--; }

  const weakBySubject = new Map();
  for (const t of r.weak_topics) if (!weakBySubject.has(t.subject_id)) weakBySubject.set(t.subject_id, t.name);
  const mockEvery = minutes >= 120 ? 2 : minutes >= 45 ? 3 : 7;
  const caDaily = user.track !== 'academic';
  const revPerDay = Math.min(30, Math.max(10, Math.ceil(due.length / 3)));

  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i);
    const left = daysLeft != null ? daysLeft - i : null;
    const items = [];
    if (left != null && left < 0) return { date, weekday: WEEKDAY_BN[weekday(date)], items: [], note: 'পরীক্ষা শেষ' };
    if (left === 0) return { date, weekday: WEEKDAY_BN[weekday(date)], items: [{ type: 'exam', title: '🎯 পরীক্ষার দিন — শুভকামনা!', minutes: 0 }], note: 'নতুন কিছু পড়বেন না' };
    if (left != null && left <= 2) {
      items.push({ type: 'revision', title: 'শুধু রিভিশন: ভুলের তালিকা ও সংরক্ষিত প্রশ্ন', minutes: Math.round(minutes * 0.7) });
      items.push({ type: 'rest', title: 'হালকা বিশ্রাম ও পর্যাপ্ত ঘুম', minutes: 0 });
      return { date, weekday: WEEKDAY_BN[weekday(date)], items, note: 'শেষ মুহূর্ত: নতুন টপিক নয়' };
    }
    items.push({ type: 'revision', title: `স্মার্ট রিভিশন (~${revPerDay} প্রশ্ন)`, minutes: Math.ceil(revPerDay * 0.7) });
    if ((i + 1) % mockEvery === 0) {
      items.push({ type: 'mock', title: `${exam.name_bn} মডেল টেস্ট + ভুল বিশ্লেষণ`, minutes: Math.min(Math.round(minutes * 0.7), exam.duration_min + 15) });
    } else {
      const focus = queue.slice(i * slotsPerDay, (i + 1) * slotsPerDay);
      const each = Math.round((minutes * 0.75) / Math.max(1, focus.length));
      for (const s of focus) {
        const weak = weakBySubject.get(s.id);
        items.push({ type: 'subject', subject_id: s.id, title: `${s.name}${weak ? ` — বিশেষ করে ${weak}` : ''}`, minutes: each, readiness: s.readiness });
      }
    }
    if (caDaily) items.push({ type: 'current_affairs', title: 'সাম্প্রতিক বিষয়াবলি — ৫ প্রশ্ন', minutes: 5 });
    for (const it of items) it.title = toBn(it.title);
    return { date, weekday: WEEKDAY_BN[weekday(date)], items, minutes: items.reduce((a, x) => a + x.minutes, 0) };
  });

  // Long-range phases.
  const PHASE_LABEL = { academic: 'টার্ম প্ল্যানার', admission: 'ভর্তি কাউন্টডাউন', job: 'দীর্ঘমেয়াদি প্রস্তুতি' }[user.track];
  let phases = [];
  if (daysLeft != null && daysLeft > 3) {
    const spec = daysLeft > 60
      ? [['ভিত্তি গঠন', 0.4, 'সিলেবাসের প্রতিটি টপিক অন্তত একবার; দুর্বল বিষয়ে বেশি সময়'], ['টার্গেটেড অনুশীলন', 0.35, 'অ্যাডাপটিভ টেস্ট, টপিকভিত্তিক দুর্বলতা দূর, সাপ্তাহিক মডেল টেস্ট'], ['পরীক্ষা সিমুলেশন', 0.15, 'প্রতি ২ দিনে পূর্ণাঙ্গ মডেল টেস্ট, সময় ব্যবস্থাপনা'], ['চূড়ান্ত রিভিশন', 0.1, 'শুধু ভুলের তালিকা ও উচ্চ-অগ্রাধিকার টপিক; নতুন কিছু নয়']]
      : daysLeft > 20
        ? [['টার্গেটেড অনুশীলন', 0.5, 'সর্বোচ্চ নম্বরের দুর্বল বিষয় আগে'], ['পরীক্ষা সিমুলেশন', 0.3, 'নিয়মিত মডেল টেস্ট ও বিশ্লেষণ'], ['চূড়ান্ত রিভিশন', 0.2, 'ভুলের রিভিশন, নতুন টপিক বন্ধ']]
        : [['সিমুলেশন ও দুর্বলতা', 0.6, 'প্রতিদিন মডেল টেস্ট বা টার্গেটেড সেট'], ['চূড়ান্ত রিভিশন', 0.4, 'শুধু রিভিশন ও বিশ্রাম']];
    let cursor = today;
    phases = spec.map(([name, share, desc], k) => {
      const len = k === spec.length - 1 ? daysBetween(cursor, examDate) : Math.max(1, Math.round(daysLeft * share));
      const p = { name, desc, from: cursor, to: addDays(cursor, len - 1), days: len, current: k === 0 };
      cursor = addDays(cursor, len);
      return p;
    });
  } else {
    // No exam date: a rolling 4-week focus rotation.
    const ranked = [...subjects].sort((a, b) => b.priority - a.priority);
    phases = [0, 1, 2, 3].map((w) => ({
      name: `সপ্তাহ ${toBn(w + 1)}`, from: addDays(today, w * 7), to: addDays(today, w * 7 + 6), days: 7, current: w === 0,
      desc: `মূল ফোকাস: ${ranked.slice(w * 2, w * 2 + 2).map((s) => s.name).join(', ') || 'পূর্ণাঙ্গ রিভিশন'} + সাপ্তাহিক মডেল টেস্ট`,
    }));
  }

  return {
    label: PHASE_LABEL, exam: { name: exam.name_bn, date: examDate }, days_left: daysLeft, daily_minutes: minutes,
    week, phases, progress: await weekProgress(user),
  };
}

export async function setWeeklyGoal(userId, goal) {
  await query('UPDATE users SET weekly_goal=? WHERE id=?', [goal || null, userId]);
  return one('SELECT weekly_goal FROM users WHERE id=?', [userId]);
}
