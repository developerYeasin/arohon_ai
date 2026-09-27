// The preparation engine: readiness profile, adaptive question selection,
// spaced repetition, daily mission and time-boxed sessions.
import { query, one } from '../db.js';
import { dhakaToday, addDays, clamp, pct, shuffle, parseJson, toBn } from './util.js';
import { MISTAKE_TYPES, effectiveType } from './mistakes.js';

// ---------- Target exam & syllabus ----------
export async function getUserExam(user) {
  let exam = user.target_exam_id ? await one('SELECT * FROM exams WHERE id=?', [user.target_exam_id]) : null;
  if (!exam) exam = await one('SELECT * FROM exams WHERE track=? ORDER BY sort_order LIMIT 1', [user.track]);
  return exam;
}

export async function examSubjects(examId) {
  return query(
    `SELECT s.id, s.slug, s.name_bn, s.name_en, es.question_count
       FROM exam_subjects es JOIN subjects s ON s.id=es.subject_id
      WHERE es.exam_id=? ORDER BY es.question_count DESC`, [examId]);
}

// Previous-year-question frequency per topic: how often a topic has actually been examined.
export async function pyqFrequency(subjectIds) {
  if (!subjectIds.length) return new Map();
  const rows = await query(
    `SELECT topic_id, COUNT(*) n, COUNT(DISTINCT year) years, MIN(year) first_year, MAX(year) last_year
       FROM questions WHERE year IS NOT NULL AND status='active' AND subject_id IN (?) GROUP BY topic_id`, [subjectIds]);
  return new Map(rows.map((r) => [r.topic_id, r]));
}

// ---------- Per-topic performance ----------
export async function topicStats(userId, subjectIds, days = 120) {
  if (!subjectIds.length) return [];
  return query(
    `SELECT q.topic_id, q.subject_id,
            COUNT(*) attempts,
            SUM(aa.selected_option IS NOT NULL) answered,
            SUM(aa.is_correct) correct,
            AVG(CASE WHEN aa.selected_option IS NOT NULL THEN aa.time_ms END) avg_ms
       FROM attempt_answers aa JOIN questions q ON q.id=aa.question_id
       JOIN attempts a ON a.id=aa.attempt_id AND a.status='submitted'
      WHERE aa.user_id=? AND q.subject_id IN (?) AND aa.created_at >= NOW() - INTERVAL ? DAY
      GROUP BY q.topic_id, q.subject_id`, [userId, subjectIds, days]);
}

// Laplace-smoothed accuracy so 1/1 isn't "100% mastered".
export const smoothAcc = (correct, n) => (Number(correct) + 1) / (Number(n) + 2);

// ---------- Exam Readiness Profile ----------
export async function readiness(user) {
  const exam = await getUserExam(user);
  if (!exam) return null;
  const subjects = await examSubjects(exam.id);
  const subjectIds = subjects.map((s) => s.id);
  const [stats, topics, pyq] = await Promise.all([
    topicStats(user.id, subjectIds),
    subjectIds.length ? query('SELECT id, subject_id, name_bn FROM topics WHERE subject_id IN (?)', [subjectIds]) : [],
    pyqFrequency(subjectIds),
  ]);
  const statByTopic = new Map(stats.map((s) => [s.topic_id, s]));
  const neg = Number(exam.negative_mark);
  const totalQ = subjects.reduce((a, s) => a + s.question_count, 0) || 1;

  let weightedReady = 0, projected = 0, totalAnswers = 0;
  const subjectRows = subjects.map((s) => {
    const sTopics = topics.filter((t) => t.subject_id === s.id);
    let n = 0, c = 0, touched = 0;
    for (const t of sTopics) {
      const st = statByTopic.get(t.id);
      if (!st) continue;
      n += Number(st.attempts); c += Number(st.correct);
      if (st.attempts >= 3) touched++;
    }
    totalAnswers += n;
    const coverage = sTopics.length ? touched / sTopics.length : 0;
    const acc = n ? smoothAcc(c, n) : 0;
    const ready = n ? Math.round(100 * acc * (0.6 + 0.4 * coverage)) : 0;
    weightedReady += ready * s.question_count;
    projected += s.question_count * Math.max(0, acc - (1 - acc) * neg);
    return { id: s.id, slug: s.slug, name: s.name_bn, questions: s.question_count, readiness: ready,
      accuracy: n ? pct(c, n) : null, attempts: n, coverage: Math.round(coverage * 100) };
  });

  // Topic-level weakness, weighted by exam relevance (PYQ frequency).
  const maxPyq = Math.max(1, ...[...pyq.values()].map((p) => p.n));
  const topicRows = topics.map((t) => {
    const st = statByTopic.get(t.id);
    const p = pyq.get(t.id);
    const relevance = 1 + (p ? p.n / maxPyq : 0);
    const acc = st ? smoothAcc(st.correct, st.attempts) : null;
    return { id: t.id, subject_id: t.subject_id, name: t.name_bn, attempts: st ? Number(st.attempts) : 0,
      accuracy: st ? pct(st.correct, st.attempts) : null, acc, relevance, pyq: p ? p.n : 0,
      avg_sec: st?.avg_ms ? Math.round(st.avg_ms / 1000) : null };
  });
  const weakTopics = topicRows.filter((t) => t.attempts >= 3)
    .sort((a, b) => (1 - b.acc) * b.relevance - (1 - a.acc) * a.relevance).slice(0, 5)
    .filter((t) => t.accuracy < 75);

  // Dimensions from recent answer telemetry.
  const recent = await query(
    `SELECT aa.is_correct, aa.selected_option, aa.time_ms, aa.confidence, aa.mistake_type, aa.mistake_type_user
       FROM attempt_answers aa JOIN attempts a ON a.id=aa.attempt_id AND a.status='submitted'
      WHERE aa.user_id=? ORDER BY aa.id DESC LIMIT 400`, [user.id]);
  const answered = recent.filter((r) => r.selected_option);
  const accuracy = answered.length ? pct(answered.filter((r) => r.is_correct).length, answered.length) : null;
  const target = exam.sec_per_question * 1000;
  const timeMgmt = answered.length ? pct(answered.filter((r) => r.time_ms <= target).length, answered.length) : null;

  const mocks = await query(
    `SELECT a.score, a.total FROM attempts a JOIN tests t ON t.id=a.test_id
      WHERE a.user_id=? AND a.status='submitted' AND t.kind IN ('mock','live','adaptive','mission','session') AND a.total>=10
      ORDER BY a.submitted_at DESC LIMIT 6`, [user.id]);
  const mockPcts = mocks.map((m) => (100 * Number(m.score)) / m.total);
  let consistency = null, simulation = null;
  if (mockPcts.length >= 2) {
    const mean = mockPcts.reduce((a, b) => a + b, 0) / mockPcts.length;
    const sd = Math.sqrt(mockPcts.reduce((a, b) => a + (b - mean) ** 2, 0) / mockPcts.length);
    consistency = Math.round(clamp(100 - sd * 2.5));
  }
  if (mockPcts.length) simulation = Math.round(clamp(mockPcts.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(3, mockPcts.length)));

  const ret = await one(
    `SELECT SUM(times_right) r, SUM(times_wrong - 1) w FROM review_items WHERE user_id=? AND (times_right+times_wrong)>=2`, [user.id]);
  // Retention = success rate on re-tests of previously missed questions (the first miss doesn't count).
  const retention = ret && Number(ret.r) + Number(ret.w) > 0 ? pct(Number(ret.r), Number(ret.r) + Number(ret.w)) : null;

  const subjectReady = Math.round(weightedReady / totalQ);
  const dims = [[subjectReady, 0.6], [timeMgmt, 0.1], [consistency, 0.1], [retention, 0.1], [simulation, 0.1]];
  const wsum = dims.filter(([v]) => v != null).reduce((a, [, w]) => a + w, 0);
  const overall = wsum ? Math.round(dims.filter(([v]) => v != null).reduce((a, [v, w]) => a + v * w, 0) / wsum) : 0;

  // Mistake mix → biggest risk.
  const mix = {};
  for (const r of recent) {
    const t = effectiveType(r);
    if (!r.is_correct && t) mix[t] = (mix[t] || 0) + 1;
  }
  const wrongTotal = Object.values(mix).reduce((a, b) => a + b, 0);
  const risks = [];
  if (timeMgmt != null && timeMgmt < 60) risks.push({ key: 'speed', text: 'সময়ের চাপে গতি কম — অনেক প্রশ্নে লক্ষ্যমাত্রার বেশি সময় লাগছে', score: 100 - timeMgmt });
  const nonKnowledge = (mix.careless || 0) + (mix.misread || 0) + (mix.time_pressure || 0);
  if (wrongTotal >= 5 && nonKnowledge / wrongTotal > 0.3) risks.push({ key: 'careless', text: `জানা প্রশ্নেও নম্বর হারাচ্ছেন — ভুলের ${pct(nonKnowledge, wrongTotal)}% অসাবধানতা/তাড়াহুড়ো`, score: pct(nonKnowledge, wrongTotal) });
  if (wrongTotal >= 5 && (mix.guessing || 0) / wrongTotal > 0.2) risks.push({ key: 'guess', text: 'আন্দাজের উত্তরে নেগেটিভ মার্ক কাটছে', score: pct(mix.guessing, wrongTotal) });
  const lowCov = subjectRows.filter((s) => s.coverage < 30).sort((a, b) => b.questions - a.questions)[0];
  if (lowCov && totalAnswers >= 30) risks.push({ key: 'coverage', text: `${lowCov.name} — সিলেবাসের বেশিরভাগ টপিক এখনো অনুশীলন হয়নি (${lowCov.questions} নম্বরের বিষয়)`, score: 100 - lowCov.coverage });
  if (retention != null && retention < 60) risks.push({ key: 'retention', text: 'আগে ভুল করা প্রশ্ন রিভিশনেও আবার ভুল হচ্ছে — ব্যাখ্যা পড়ে রিভিশন করুন', score: 100 - retention });
  risks.sort((a, b) => b.score - a.score);
  for (const r of risks) r.text = toBn(r.text);

  const weakestSubject = subjectRows.filter((s) => s.attempts > 0).sort((a, b) => a.readiness - b.readiness)[0] || null;
  const weakestTopic = weakTopics[0] || null;
  let action;
  if (totalAnswers < 20) action = { type: 'diagnostic', text: 'প্রথমে ২০ প্রশ্নের একটি ডায়াগনস্টিক টেস্ট দিন — এরপর আপনার সঠিক প্রস্তুতি-মানচিত্র তৈরি হবে।' };
  else if (risks[0]?.key === 'speed') action = { type: 'speed_drill', text: '৩ দিনের স্পিড ড্রিল: প্রতিদিন ২০ প্রশ্ন, প্রতি প্রশ্নে লক্ষ্য সময়ের মধ্যে।' };
  else if (weakestTopic) action = { type: 'topic', topicId: weakestTopic.id, text: `৩ দিনের রিকভারি প্ল্যান: ${weakestTopic.name} — ব্যাখ্যা + ২০টি টার্গেটেড প্রশ্ন + রি-টেস্ট।` };
  else action = { type: 'mock', text: 'একটি পূর্ণাঙ্গ মডেল টেস্ট দিয়ে নিজের সিমুলেশন রেডিনেস যাচাই করুন।' };

  return {
    exam: { id: exam.id, code: exam.code, name: exam.name_bn, total_questions: exam.total_questions, negative_mark: neg, next_exam_date: user.exam_date || exam.next_exam_date },
    overall, confidence: totalAnswers >= 300 ? 'high' : totalAnswers >= 80 ? 'medium' : 'low',
    answers_used: totalAnswers,
    projected_marks: Math.round(projected * 10) / 10,
    subjects: subjectRows,
    dimensions: { subject_mastery: subjectReady, accuracy, time_management: timeMgmt, consistency, retention, simulation },
    weak_topics: weakTopics.map(({ acc, relevance, ...t }) => t),
    weakest_subject: weakestSubject, weakest_topic: weakestTopic ? { id: weakestTopic.id, name: weakestTopic.name, accuracy: weakestTopic.accuracy } : null,
    biggest_risk: risks[0] || null, risks,
    mistake_mix: Object.entries(mix).map(([k, v]) => ({ type: k, label: MISTAKE_TYPES[k]?.bn || k, count: v })).sort((a, b) => b.count - a.count),
    recommended_action: { ...action, text: toBn(action.text) },
  };
}

// ---------- Adaptive selection ----------
/**
 * Picks questions for *this* student: weak topics × exam relevance, due revisions,
 * unseen questions, and difficulty near the student's current level.
 * Two students with different profiles get different sets from the same bank.
 */
export async function pickAdaptive(userId, { subjectIds, topicIds, count = 20, focus = 'balanced', excludeIds = [] }) {
  const where = ["q.status='active'"]; const params = [];
  if (topicIds?.length) { where.push('q.topic_id IN (?)'); params.push(topicIds); }
  else if (subjectIds?.length) { where.push('q.subject_id IN (?)'); params.push(subjectIds); }
  if (excludeIds.length) { where.push('q.id NOT IN (?)'); params.push(excludeIds); }
  const cands = await query(`SELECT q.id, q.topic_id, q.subject_id, q.difficulty, q.year FROM questions q WHERE ${where.join(' AND ')}`, params);
  if (!cands.length) return [];

  const sIds = [...new Set(cands.map((c) => c.subject_id))];
  const [stats, history, due, pyq] = await Promise.all([
    topicStats(userId, sIds),
    query(`SELECT question_id, MAX(created_at) last_at, SUBSTRING_INDEX(GROUP_CONCAT(is_correct ORDER BY id DESC), ',', 1) last_correct
             FROM attempt_answers WHERE user_id=? GROUP BY question_id`, [userId]),
    query('SELECT question_id FROM review_items WHERE user_id=? AND mastered=0 AND due_date<=?', [userId, dhakaToday()]),
    pyqFrequency(sIds),
  ]);
  const acc = new Map(stats.map((s) => [s.topic_id, smoothAcc(s.correct, s.attempts)]));
  const seen = new Map(history.map((h) => [h.question_id, h]));
  const dueSet = new Set(due.map((d) => d.question_id));
  const maxPyq = Math.max(1, ...[...pyq.values()].map((p) => p.n));

  const scored = cands.map((q) => {
    const a = acc.has(q.topic_id) ? acc.get(q.topic_id) : 0.5;
    const rel = 1 + (pyq.get(q.topic_id)?.n || 0) / maxPyq;
    let p = (focus === 'weak' ? 3 : 1.6) * (1 - a) * rel;
    if (q.year) p += 0.3; // previous-year questions are real exam items
    const h = seen.get(q.id);
    if (dueSet.has(q.id)) p += 1.5;
    else if (!h) p += 0.6;
    else if (h.last_correct === '1') p -= 1.2;
    else p += 0.4;
    const targetDiff = 1 + 4 * a; // stronger topic → harder questions
    p += 0.6 * (1 - Math.abs(q.difficulty - targetDiff) / 4);
    p += Math.random() * 0.5;
    return { ...q, p };
  }).sort((x, y) => y.p - x.p);

  // Keep variety: cap how many come from one topic.
  const cap = Math.max(3, Math.ceil(count / 3));
  const perTopic = new Map(); const picked = [];
  for (const q of scored) {
    if (picked.length >= count) break;
    const n = perTopic.get(q.topic_id) || 0;
    if (n >= cap) continue;
    perTopic.set(q.topic_id, n + 1); picked.push(q.id);
  }
  for (const q of scored) { if (picked.length >= count) break; if (!picked.includes(q.id)) picked.push(q.id); }
  return shuffle(picked);
}

// Build a question set that mirrors the real exam's subject distribution.
export async function pickMock(userId, exam, total) {
  const subjects = await examSubjects(exam.id);
  const sum = subjects.reduce((a, s) => a + s.question_count, 0) || 1;
  const ids = [];
  for (const s of subjects) {
    const n = Math.max(1, Math.round((s.question_count / sum) * total));
    const rows = await query(`SELECT id FROM questions WHERE subject_id=? AND status='active' ORDER BY RAND() LIMIT ?`, [s.id, n]);
    ids.push(...rows.map((r) => r.id));
  }
  return ids.slice(0, total);
}

// ---------- Tests ----------
export async function createTest({ title, kind, track = null, examId = null, questionIds, durationSec = 0, negativeMark = 0,
  instantFeedback = false, isPublic = false, startsAt = null, endsAt = null, meta = null, userId = null }) {
  const r = await query(
    `INSERT INTO tests (title, kind, track, exam_id, duration_sec, negative_mark, instant_feedback, is_public, starts_at, ends_at, meta, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [title, kind, track, examId, durationSec, negativeMark, instantFeedback ? 1 : 0, isPublic ? 1 : 0, startsAt, endsAt, meta ? JSON.stringify(meta) : null, userId]);
  const testId = r.insertId;
  if (questionIds.length) {
    await query('INSERT INTO test_questions (test_id, question_id, position) VALUES ?', [questionIds.map((q, i) => [testId, q, i + 1])]);
  }
  return testId;
}

// ---------- Spaced repetition (Leitner) ----------
const INTERVALS = [1, 3, 7, 16, 35];
export async function updateReview(userId, questionId, correct, mistakeType) {
  const today = dhakaToday();
  const cur = await one('SELECT * FROM review_items WHERE user_id=? AND question_id=?', [userId, questionId]);
  if (!cur) {
    if (correct) return; // only mistakes enter the revision system
    await query(`INSERT INTO review_items (user_id, question_id, box, due_date, times_wrong, last_mistake_type, last_seen_at)
                 VALUES (?,?,0,?,1,?,NOW())`, [userId, questionId, addDays(today, 1), mistakeType]);
    return;
  }
  if (correct) {
    const box = Math.min(cur.box + 1, INTERVALS.length);
    const mastered = box >= INTERVALS.length ? 1 : 0;
    await query(`UPDATE review_items SET box=?, due_date=?, times_right=times_right+1, mastered=?, last_seen_at=NOW()
                 WHERE user_id=? AND question_id=?`, [box, addDays(today, INTERVALS[Math.min(box, INTERVALS.length - 1)]), mastered, userId, questionId]);
  } else {
    await query(`UPDATE review_items SET box=0, due_date=?, times_wrong=times_wrong+1, mastered=0, last_mistake_type=?, last_seen_at=NOW()
                 WHERE user_id=? AND question_id=?`, [addDays(today, 1), mistakeType, userId, questionId]);
  }
}

export async function dueReviewIds(userId, limit = 30) {
  const rows = await query(
    `SELECT question_id FROM review_items WHERE user_id=? AND mastered=0 AND due_date<=?
      ORDER BY times_wrong DESC, due_date ASC LIMIT ?`, [userId, dhakaToday(), limit]);
  return rows.map((r) => r.question_id);
}

// ---------- Today's Mission ----------
export async function getMission(user) {
  const today = dhakaToday();
  const existing = await one('SELECT items FROM daily_missions WHERE user_id=? AND mission_date=?', [user.id, today]);
  if (existing) return { date: today, items: parseJson(existing.items, []) };

  const exam = await getUserExam(user);
  const subjects = exam ? await examSubjects(exam.id) : [];
  const subjectIds = subjects.map((s) => s.id);
  const items = [];
  const due = await dueReviewIds(user.id, 15);
  if (due.length) items.push({ key: 'review', type: 'revision', title: `${due.length}টি ভুল প্রশ্ন রিভিশন`, count: due.length, minutes: Math.ceil(due.length * 0.75) });

  const stats = await topicStats(user.id, subjectIds);
  const weak = stats.filter((s) => s.attempts >= 3).sort((a, b) => smoothAcc(a.correct, a.attempts) - smoothAcc(b.correct, b.attempts)).slice(0, 3);
  let weakNames = '';
  if (weak.length) {
    const names = await query('SELECT name_bn FROM topics WHERE id IN (?)', [weak.map((w) => w.topic_id)]);
    weakNames = names.map((n) => n.name_bn).join(', ');
  }
  items.push({ key: 'weak', type: 'adaptive', title: weak.length ? `দুর্বল টপিক অনুশীলন: ${weakNames}` : 'ডায়াগনস্টিক অনুশীলন (২০ প্রশ্ন)',
    count: 20, minutes: 15, topicIds: weak.map((w) => w.topic_id) });

  const ca = await one("SELECT COUNT(*) n FROM questions WHERE current_affair_id IS NOT NULL AND status='active'");
  if (ca.n > 0 && user.track !== 'academic') items.push({ key: 'ca', type: 'current_affairs', title: 'আজকের সাম্প্রতিক বিষয়াবলি — ৫ প্রশ্ন', count: 5, minutes: 4 });

  const lastMock = await one(
    `SELECT MAX(a.submitted_at) d FROM attempts a JOIN tests t ON t.id=a.test_id WHERE a.user_id=? AND t.kind IN ('mock','live') AND a.status='submitted'`, [user.id]);
  const mockStale = !lastMock?.d || (Date.now() - new Date(lastMock.d).getTime()) / 86400000 >= 5;
  if (mockStale && user.daily_minutes >= 45 && exam) items.push({ key: 'mock', type: 'mock', title: `মিনি মডেল টেস্ট — ${exam.name_bn} প্যাটার্নে ২৫ প্রশ্ন`, count: 25, minutes: Math.ceil((25 * exam.sec_per_question) / 60) });

  for (const it of items) it.done = false;
  await query('INSERT IGNORE INTO daily_missions (user_id, mission_date, items) VALUES (?,?,?)', [user.id, today, JSON.stringify(items)]);
  return { date: today, items };
}

export async function markMissionDone(userId, date, key, attemptId) {
  const row = await one('SELECT items FROM daily_missions WHERE user_id=? AND mission_date=?', [userId, date]);
  if (!row) return;
  const items = parseJson(row.items, []).map((it) => (it.key === key ? { ...it, done: true, attempt_id: attemptId } : it));
  await query('UPDATE daily_missions SET items=? WHERE user_id=? AND mission_date=?', [JSON.stringify(items), userId, date]);
}

// ---------- "I have N minutes" session builder ----------
export async function buildSession(user, minutes) {
  const exam = await getUserExam(user);
  const secPerQ = exam?.sec_per_question || 40;
  const total = clamp(Math.floor((minutes * 60) / (secPerQ * 1.3)), 5, 150);
  const due = await dueReviewIds(user.id, Math.round(total * 0.3));
  const subjects = exam ? await examSubjects(exam.id) : [];
  const adaptive = await pickAdaptive(user.id, { subjectIds: subjects.map((s) => s.id), count: total - due.length, focus: 'weak', excludeIds: due });
  const plan = {
    minutes, total: due.length + adaptive.length,
    parts: [
      due.length ? { label: 'ভুলের রিভিশন', count: due.length } : null,
      { label: 'দুর্বল টপিকে টার্গেটেড প্রশ্ন', count: adaptive.length },
    ].filter(Boolean),
  };
  return { exam, questionIds: shuffle([...due, ...adaptive]), plan, durationSec: minutes * 60 };
}
