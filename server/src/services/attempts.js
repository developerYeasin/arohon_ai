import { query, one, tx } from '../db.js';
import { classifyMistake, effectiveType, MISTAKE_TYPES } from './mistakes.js';
import { updateReview, markMissionDone } from './engine.js';
import { evaluateBadges } from './badges.js';
import { rewardReferral } from './billing.js';
import { dhakaToday, addDays, pct, parseJson, HttpError, toBn } from './util.js';

export async function testQuestions(testId) {
  return query(
    `SELECT q.*, s.slug subject_slug, s.name_bn subject_name, t.name_bn topic_name, tq.position
       FROM test_questions tq JOIN questions q ON q.id=tq.question_id
       JOIN subjects s ON s.id=q.subject_id JOIN topics t ON t.id=q.topic_id
      WHERE tq.test_id=? ORDER BY tq.position`, [testId]);
}

export const liveResultsHidden = (test) => test.kind === 'live' && test.ends_at && new Date(test.ends_at) > new Date();

async function targetSecFor(test) {
  if (test.exam_id) {
    const e = await one('SELECT sec_per_question FROM exams WHERE id=?', [test.exam_id]);
    if (e) return e.sec_per_question;
  }
  return 40;
}

export async function submitAttempt(attempt, test, answersIn) {
  if (attempt.status === 'submitted') throw new HttpError(409, 'এই পরীক্ষা ইতিমধ্যে জমা হয়েছে');
  const qs = await testQuestions(test.id);
  const byId = new Map((answersIn || []).map((a) => [Number(a.question_id), a]));
  const targetSec = await targetSecFor(test);
  const neg = Number(test.negative_mark);
  const userId = attempt.user_id;

  const prevCorrect = new Set((await query(
    `SELECT DISTINCT question_id FROM attempt_answers WHERE user_id=? AND is_correct=1 AND question_id IN (?)`,
    [userId, qs.map((q) => q.id)])).map((r) => r.question_id));

  let correct = 0, wrong = 0, skipped = 0;
  const rows = [];
  for (const q of qs) {
    const a = byId.get(q.id) || {};
    const sel = ['a', 'b', 'c', 'd'].includes(a.selected) ? a.selected : null;
    const timeMs = Math.max(0, Math.min(Number(a.time_ms) || 0, 30 * 60 * 1000));
    const isCorrect = sel && sel === q.correct_option ? 1 : 0;
    let mistakeType = null;
    if (!sel) skipped++;
    else if (isCorrect) correct++;
    else {
      wrong++;
      mistakeType = classifyMistake({
        timeMs, targetSec, confidence: a.confidence, answeredAtSec: a.answered_at_sec, durationSec: test.duration_sec,
        everCorrectBefore: prevCorrect.has(q.id), subjectSlug: q.subject_slug, changedAnswer: !!a.changed,
      });
    }
    rows.push({ q, sel, isCorrect, timeMs, mistakeType, a });
  }

  const elapsed = Math.round((Date.now() - new Date(attempt.started_at).getTime()) / 1000);
  const timeSpent = test.duration_sec ? Math.min(elapsed, test.duration_sec + 30) : elapsed;
  const score = Math.round((correct - wrong * neg) * 100) / 100;
  const answeredCount = correct + wrong;
  const flagged = qs.length >= 10 && timeSpent < qs.length * 3 && answeredCount > 0 && correct / answeredCount > 0.9 ? 1 : 0;
  const xp = answeredCount + correct * 2 + (qs.length >= 10 ? 20 : 5);

  await tx(async (q) => {
    if (rows.length) {
      await q(`INSERT INTO attempt_answers (attempt_id, user_id, question_id, position, selected_option, is_correct, time_ms, answered_at_sec, confidence, changed_answer, mistake_type)
               VALUES ?`, [rows.map((r) => [attempt.id, userId, r.q.id, r.q.position, r.sel, r.isCorrect, r.timeMs,
        r.a.answered_at_sec ?? null, ['sure', 'unsure', 'guess'].includes(r.a.confidence) ? r.a.confidence : null, r.a.changed ? 1 : 0, r.mistakeType])]);
    }
    await q(`UPDATE attempts SET status='submitted', submitted_at=NOW(), total=?, correct=?, wrong=?, skipped=?, score=?, time_spent_sec=?, xp_earned=?, flagged=? WHERE id=?`,
      [qs.length, correct, wrong, skipped, score, timeSpent, xp, flagged, attempt.id]);
    // Question analytics feed the quality loop.
    for (const r of rows) {
      const wrongCol = r.sel && !r.isCorrect ? `, wrong_${r.sel}=wrong_${r.sel}+1` : '';
      await q(`UPDATE questions SET attempt_count=attempt_count+1, correct_count=correct_count+?, skip_count=skip_count+?, total_time_ms=total_time_ms+?${wrongCol} WHERE id=?`,
        [r.isCorrect, r.sel ? 0 : 1, r.timeMs, r.q.id]);
    }
  });

  for (const r of rows) {
    if (r.sel) await updateReview(userId, r.q.id, !!r.isCorrect, r.mistakeType);
    else await updateReview(userId, r.q.id, false, 'didnt_know');
  }
  await awardXpAndStreak(userId, xp);
  await evaluateBadges(userId, { test, attempt: { total: qs.length, correct } });
  // Reward the referrer only once the invited student has done real practice (10+ questions).
  if (qs.length >= 10) await rewardReferral(userId);
  const meta = parseJson(test.meta, {});
  if (meta?.mission) await markMissionDone(userId, meta.mission.date, meta.mission.key, attempt.id);
  return attempt.id;
}

async function awardXpAndStreak(userId, xp) {
  const u = await one('SELECT streak, best_streak, last_active_date FROM users WHERE id=?', [userId]);
  const today = dhakaToday();
  let streak = u.streak;
  if (u.last_active_date !== today) streak = u.last_active_date === addDays(today, -1) ? streak + 1 : 1;
  await query('UPDATE users SET xp=xp+?, streak=?, best_streak=GREATEST(best_streak,?), last_active_date=? WHERE id=?',
    [xp, streak, streak, today, userId]);
}

// ---------- Diagnostic report ----------
export async function buildReport(attemptId, viewer) {
  const attempt = await one('SELECT * FROM attempts WHERE id=?', [attemptId]);
  if (!attempt) throw new HttpError(404, 'ফলাফল পাওয়া যায়নি');
  if (attempt.user_id !== viewer.id && !['admin', 'teacher'].includes(viewer.role)) throw new HttpError(403, 'অনুমতি নেই');
  if (attempt.status !== 'submitted') throw new HttpError(400, 'পরীক্ষাটি এখনো জমা হয়নি');
  const test = await one('SELECT * FROM tests WHERE id=?', [attempt.test_id]);
  const hide = liveResultsHidden(test);
  const answers = await query(
    `SELECT aa.*, q.body, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option, q.explanation, q.source, q.exam_ref, q.year,
            q.difficulty, q.subject_id, q.topic_id, s.name_bn subject_name, t.name_bn topic_name,
            q.attempt_count, q.correct_count, q.total_time_ms, q.last_verified_at, q.status q_status,
            EXISTS(SELECT 1 FROM bookmarks b WHERE b.user_id=aa.user_id AND b.question_id=q.id) bookmarked
       FROM attempt_answers aa JOIN questions q ON q.id=aa.question_id
       JOIN subjects s ON s.id=q.subject_id JOIN topics t ON t.id=q.topic_id
      WHERE aa.attempt_id=? ORDER BY aa.position`, [attemptId]);
  const targetSec = await targetSecFor(test);
  const neg = Number(test.negative_mark);

  // Per-subject breakdown with time share.
  const subj = new Map();
  let totalTime = 0;
  for (const a of answers) {
    const s = subj.get(a.subject_id) || { id: a.subject_id, name: a.subject_name, total: 0, correct: 0, wrong: 0, skipped: 0, time_ms: 0 };
    s.total++; s.time_ms += a.time_ms; totalTime += a.time_ms;
    if (!a.selected_option) s.skipped++; else if (a.is_correct) s.correct++; else s.wrong++;
    subj.set(a.subject_id, s);
  }
  const subjects = [...subj.values()].map((s) => ({ ...s, accuracy: pct(s.correct, s.correct + s.wrong),
    time_share: pct(s.time_ms, totalTime), expected_share: pct(s.total, answers.length),
    avg_sec: s.correct + s.wrong ? Math.round(s.time_ms / 1000 / (s.correct + s.wrong)) : 0 }));

  const insights = [];
  const answered = answers.filter((a) => a.selected_option);
  const wrongs = answered.filter((a) => !a.is_correct);
  const types = {};
  for (const w of wrongs) { const t = effectiveType(w); types[t] = (types[t] || 0) + 1; }
  const nonKnowledge = (types.careless || 0) + (types.misread || 0) + (types.time_pressure || 0) + (types.calculation || 0);
  const knew = attempt.correct + nonKnowledge;
  if (answers.length) {
    insights.push({ tone: 'info', text: `আপনি প্রায় ${pct(knew, answers.length)}% প্রশ্নের উত্তর জানতেন, কিন্তু পেয়েছেন ${pct(attempt.correct, answers.length)}%।` });
  }
  if (nonKnowledge >= 2) insights.push({ tone: 'warn', text: `${nonKnowledge}টি প্রশ্নে জ্ঞানের অভাবে নয় — অসাবধানতা, ভুল পড়া, হিসাব বা সময়ের চাপে নম্বর হারিয়েছেন (${(nonKnowledge * (1 + neg)).toFixed(2)} নম্বরের প্রভাব)।` });
  if (neg > 0 && attempt.wrong > 0) insights.push({ tone: 'warn', text: `নেগেটিভ মার্কিংয়ে কাটা গেছে ${(attempt.wrong * neg).toFixed(2)} নম্বর।` });

  const guesses = answered.filter((a) => a.confidence === 'guess');
  if (guesses.length >= 3) {
    const rate = guesses.filter((g) => g.is_correct).length / guesses.length;
    const breakEven = neg / (1 + neg);
    insights.push({ tone: rate > breakEven + 0.1 ? 'good' : 'warn',
      text: `আন্দাজে ${guesses.length}টি উত্তর দিয়েছেন, সঠিক ${Math.round(rate * 100)}%। ${rate > breakEven + 0.1 ? 'আপনার শিক্ষিত আন্দাজ লাভজনক হচ্ছে।' : 'এই হারে আন্দাজ করলে নেগেটিভ মার্কে ক্ষতি হচ্ছে — নিশ্চিত না হলে বাদ দিন।'}` });
  }

  // Accuracy across the timeline of the exam (fatigue / pressure detection).
  if (test.duration_sec > 0 && answered.length >= 12) {
    const q = (x) => answered.filter((a) => a.answered_at_sec != null && a.answered_at_sec >= x[0] * test.duration_sec && a.answered_at_sec < x[1] * test.duration_sec);
    const first = q([0, 0.75]); const last = q([0.75, 1.01]);
    if (first.length >= 5 && last.length >= 4) {
      const a1 = pct(first.filter((a) => a.is_correct).length, first.length);
      const a2 = pct(last.filter((a) => a.is_correct).length, last.length);
      if (a1 - a2 >= 15) insights.push({ tone: 'warn', text: `জ্ঞান ভালো, কিন্তু শেষ ২৫% সময়ে নির্ভুলতা ${a1}% থেকে ${a2}%-এ নেমে গেছে — শেষ দিকের চাপ সামলানোর অনুশীলন দরকার।` });
    }
  }
  for (const s of subjects) {
    if (s.expected_share >= 10 && s.time_share - s.expected_share >= 10) {
      insights.push({ tone: 'warn', text: `${s.name}-এ প্রত্যাশার চেয়ে ${Math.round(((s.time_share - s.expected_share) / s.expected_share) * 100)}% বেশি সময় দিয়েছেন।` });
    }
  }
  const slow = answered.filter((a) => a.time_ms > targetSec * 1000 * 1.5).length;
  if (answered.length && slow / answered.length > 0.3) insights.push({ tone: 'warn', text: `${slow}টি প্রশ্নে লক্ষ্য সময়ের (${targetSec} সেকেন্ড) দেড়গুণের বেশি লেগেছে — গতি একটি বড় ঝুঁকি।` });
  if (answers.length && pct(attempt.correct, answers.length) >= 80) insights.push({ tone: 'good', text: 'চমৎকার! এই সেটে আপনার পারফরম্যান্স খুব ভালো — এখন কঠিন প্রশ্নে যান।' });

  // Rank / percentile among everyone who took the same test.
  let rank = null, percentile = null, participants = 1;
  const others = await query(`SELECT score FROM attempts WHERE test_id=? AND status='submitted' AND flagged=0`, [test.id]);
  if (others.length > 1) {
    participants = others.length;
    const better = others.filter((o) => Number(o.score) > Number(attempt.score)).length;
    const lower = others.filter((o) => Number(o.score) < Number(attempt.score)).length;
    rank = better + 1;
    percentile = Math.round((lower / (participants - 1)) * 100);
  }

  const mistakeSummary = Object.entries(types).map(([k, v]) => ({ type: k, label: MISTAKE_TYPES[k]?.bn || k, remedy: MISTAKE_TYPES[k]?.remedy, count: v }))
    .sort((a, b) => b.count - a.count);

  return {
    attempt: { ...attempt, score: Number(attempt.score) },
    test: { id: test.id, title: test.title, kind: test.kind, negative_mark: neg, duration_sec: test.duration_sec, meta: parseJson(test.meta, {}) },
    results_hidden: hide,
    ranking: { rank, percentile, participants },
    subjects, insights: insights.map((i) => ({ ...i, text: toBn(i.text) })), mistake_summary: mistakeSummary, target_sec: targetSec,
    answers: answers.map((a) => ({
      question_id: a.question_id, position: a.position, body: a.body,
      options: { a: a.option_a, b: a.option_b, c: a.option_c, d: a.option_d },
      selected: a.selected_option, correct: hide ? null : a.correct_option, is_correct: hide ? null : !!a.is_correct,
      explanation: hide ? null : a.explanation, subject: a.subject_name, topic: a.topic_name, topic_id: a.topic_id,
      source: a.source, exam_ref: a.exam_ref, year: a.year, difficulty: a.difficulty, last_verified_at: a.last_verified_at,
      time_sec: Math.round(a.time_ms / 1000), confidence: a.confidence, bookmarked: !!a.bookmarked,
      mistake_type: hide ? null : effectiveType(a), mistake_auto: a.mistake_type, mistake_user: a.mistake_type_user,
      global_accuracy: a.attempt_count ? pct(a.correct_count, a.attempt_count) : null,
    })),
  };
}
