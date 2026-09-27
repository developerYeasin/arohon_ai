// Viva (oral interview) simulation. Answers arrive as text — typed, or transcribed in the browser
// from the student's voice. Content coverage, length, speaking pace, filler words and hedging are
// measured directly; tone of voice and body language are not judged (we only have text).
import { z } from 'zod';
import { structured } from './ai.js';
import { parseJson, toBn } from './util.js';
import { countWords } from './written.js';

const FILLERS = ['মানে', 'আসলে', 'উম', 'আম্', 'ইয়ে', 'তো', 'like', 'actually', 'basically', 'you know', 'umm', 'uh'];
const HEDGES = ['মনে হয়', 'হয়তো', 'সম্ভবত', 'জানি না', 'ঠিক জানি না', 'শিওর না', 'নিশ্চিত না', 'i think', 'maybe', 'not sure'];
const countAll = (text, list) => list.reduce((n, w) => n + (text.toLowerCase().split(w.toLowerCase()).length - 1), 0);

export const CATEGORY_BN = {
  personal: 'ব্যক্তিগত পরিচিতি', motivation: 'ক্যাডার/পেশা পছন্দ', district: 'নিজ জেলা', bangladesh: 'বাংলাদেশ', liberation: 'মুক্তিযুদ্ধ',
  constitution: 'সংবিধান ও শাসনব্যবস্থা', current: 'সাম্প্রতিক বিষয়', international: 'আন্তর্জাতিক', subject: 'নিজ বিষয়', situational: 'পরিস্থিতিভিত্তিক',
};

function heuristic(q, answer, durationSec, inputMode) {
  const words = countWords(answer);
  const keyPoints = parseJson(q?.key_points, []) || [];
  const lower = answer.toLowerCase();
  const covered = keyPoints.filter((k) => (k.keywords || [k.point]).some((w) => lower.includes(String(w).toLowerCase())));
  const fillers = countAll(answer, FILLERS);
  const hedges = countAll(answer, HEDGES);
  const wpm = durationSec > 5 ? Math.round((words / durationSec) * 60) : null;
  const content = keyPoints.length ? Math.round((100 * covered.length) / keyPoints.length) : Math.min(100, Math.round((words / 60) * 100));
  const clarity = Math.max(0, 100 - Math.round((fillers / Math.max(1, words)) * 400) - (words > 180 ? 20 : 0));
  const confidence = Math.max(0, 100 - hedges * 20 - (words < 15 ? 30 : 0));
  const tips = [];
  if (words < 25) tips.push('উত্তর খুব সংক্ষিপ্ত — ২-৩টি পূর্ণ বাক্যে মূল কথা, একটি উদাহরণ ও একটি উপসংহার দিন।');
  if (words > 180) tips.push('উত্তর দীর্ঘ — ভাইভায় ১-২ মিনিটের মধ্যে মূল কথা বলুন; বোর্ড আরও জানতে চাইলে জিজ্ঞেস করবে।');
  if (fillers >= 3) tips.push(`"মানে/আসলে" জাতীয় শব্দ ${toBn(fillers)} বার — থেমে ভেবে তারপর বলুন।`);
  if (hedges >= 2) tips.push('"হয়তো/মনে হয়" বারবার বলছেন — না জানলে বিনয়ের সঙ্গে স্বীকার করুন, আন্দাজে বলবেন না।');
  if (inputMode === 'voice' && wpm && wpm > 170) tips.push('খুব দ্রুত বলছেন — একটু ধীরে, স্পষ্ট উচ্চারণে বলুন।');
  if (inputMode === 'voice' && wpm && wpm < 70) tips.push('গতি ধীর — প্রস্তুতি নিয়ে সাবলীলভাবে বলার অনুশীলন করুন।');
  const missing = keyPoints.filter((k) => !covered.includes(k)).map((k) => k.point);
  if (missing.length) tips.push(`যা বলা যেত: ${missing.slice(0, 3).join('; ')}`);
  return {
    engine: 'heuristic', scores: { content, clarity, confidence }, words, wpm, fillers, hedges,
    comment: tips.length ? 'কিছু বিষয়ে উন্নতির সুযোগ আছে।' : 'গোছানো উত্তর — এভাবেই চালিয়ে যান।', tips,
    better_outline: keyPoints.map((k) => k.point), follow_up: null,
  };
}

const AiSchema = z.object({
  content_score: z.number(), clarity_score: z.number(), confidence_score: z.number(),
  comment: z.string(), tips: z.array(z.string()), better_outline: z.array(z.string()),
  follow_up: z.string(),
});

const SYSTEM = `You are a member of a Bangladesh Public Service Commission (BCS) viva board, and also the candidate's coach afterwards.
Given the question, the points a strong answer covers, and the candidate's answer (typed, or transcribed from speech — ignore transcription glitches),
score content, clarity and confidence (0-100; confidence judged from wording only — hedging, directness), give a short comment and concrete tips in Bangla,
list an outline of a better answer, and ask ONE natural follow-up question a real board would ask based on what the candidate said (in Bangla, or English if the conversation is in English).
Be respectful and realistic. Do not assert facts you are unsure of.`;

export async function evaluateVivaAnswer(q, questionText, answer, durationSec, inputMode) {
  const base = heuristic(q, answer, durationSec, inputMode);
  const ai = await structured({
    system: SYSTEM,
    user: JSON.stringify({ question: questionText, strong_answer_points: (parseJson(q?.key_points, []) || []).map((k) => k.point), guidance: q?.guidance || null, candidate_answer: answer, duration_sec: durationSec }),
    schema: AiSchema, effort: 'low',
  });
  if (!ai) {
    const f = parseJson(q?.follow_ups, []) || [];
    return { ...base, follow_up: f.length ? f[Math.floor(Math.random() * f.length)] : null };
  }
  const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
  return {
    ...base, engine: 'ai',
    scores: { content: clamp(ai.content_score), clarity: clamp(ai.clarity_score), confidence: clamp(ai.confidence_score) },
    comment: ai.comment, tips: [...ai.tips, ...base.tips.filter((t) => t.startsWith('"মানে') || t.includes('দ্রুত') || t.includes('গতি'))],
    better_outline: ai.better_outline, follow_up: ai.follow_up || null,
  };
}

export function summarize(answers) {
  const main = answers.filter((a) => a.feedback && !a.is_follow_up);
  if (!main.length) return null;
  const avg = (k) => Math.round(main.reduce((s, a) => s + (a.feedback.scores?.[k] || 0), 0) / main.length);
  const scores = { content: avg('content'), clarity: avg('clarity'), confidence: avg('confidence') };
  const overall = Math.round(scores.content * 0.5 + scores.clarity * 0.25 + scores.confidence * 0.25);
  const byCat = {};
  for (const a of main) {
    if (!a.category) continue;
    (byCat[a.category] ||= []).push(a.feedback.scores.content);
  }
  const cats = Object.entries(byCat).map(([c, v]) => ({ category: c, label: CATEGORY_BN[c], score: Math.round(v.reduce((x, y) => x + y, 0) / v.length) })).sort((a, b) => a.score - b.score);
  const fillers = main.reduce((s, a) => s + (a.feedback.fillers || 0), 0);
  const tips = [];
  if (scores.content < 60) tips.push('বিষয়ভিত্তিক প্রস্তুতি বাড়ান — দুর্বল বিভাগগুলোর প্রশ্নে আগে থেকে ৩-৪ পয়েন্টের কাঠামো তৈরি রাখুন।');
  if (scores.clarity < 70) tips.push('উত্তর শুরু করুন সরাসরি মূল কথায়, তারপর ব্যাখ্যা। অপ্রয়োজনীয় শব্দ এড়িয়ে চলুন।');
  if (scores.confidence < 70) tips.push('যা জানেন তা দৃঢ়ভাবে বলুন; না জানলে "দুঃখিত স্যার, এই মুহূর্তে সঠিক তথ্যটি মনে পড়ছে না" বলুন — আন্দাজ নয়।');
  if (fillers >= 5) tips.push(`পুরো সেশনে ${toBn(fillers)} বার "মানে/আসলে" জাতীয় শব্দ — আয়নার সামনে বা রেকর্ড করে অনুশীলন করুন।`);
  return { overall, scores, weakest: cats[0] || null, strongest: cats[cats.length - 1] || null, categories: cats, tips };
}
