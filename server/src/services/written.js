// Written-answer evaluation. What software can judge reliably (length, structure, coverage of
// expected points, use of data, time) is always computed. Judging argument quality and language
// needs Claude or a human; without Claude those criteria are left unscored and the result is
// labelled provisional. The expert's score is always the final one.
import { z } from 'zod';
import { structured } from './ai.js';
import { parseJson, toBn } from './util.js';

export const DEFAULT_RUBRIC = [
  { key: 'content', label: 'বিষয়বস্তু ও প্রাসঙ্গিকতা', weight: 0.45 },
  { key: 'structure', label: 'কাঠামো (ভূমিকা → মূল অংশ → উপসংহার)', weight: 0.2 },
  { key: 'evidence', label: 'তথ্য, উদাহরণ ও উদ্ধৃতি', weight: 0.15 },
  { key: 'language', label: 'ভাষা ও উপস্থাপন', weight: 0.2 },
];

const CONCLUSION = /(উপসংহার|পরিশেষে|সর্বোপরি|সুতরাং|শেষ কথা|in conclusion|to conclude|to sum up|finally)/i;
const INTRO = /(ভূমিকা|সূচনা|introduction)/i;

export const countWords = (t) => (t.trim().match(/\S+/g) || []).length;

export function analyse(answer, prompt) {
  const words = countWords(answer);
  const paras = answer.split(/\n\s*\n|\n(?=\s*[-•*০-৯0-9]+[.)])/).map((p) => p.trim()).filter(Boolean);
  const lines = answer.split('\n').map((l) => l.trim()).filter(Boolean);
  const bullets = lines.filter((l) => /^([-•*]|[০-৯0-9]+[.)]|[ক-ঘ][.)])/.test(l)).length;
  const headings = lines.filter((l) => l.length < 60 && /[:：]$/.test(l)).length;
  const numbers = (answer.match(/[০-৯0-9]{2,}/g) || []).length;
  const quotes = (answer.match(/["“”«»]/g) || []).length / 2;
  const hasConclusion = paras.length >= 2 && CONCLUSION.test(paras[paras.length - 1]);
  const hasIntro = paras.length >= 2 && (INTRO.test(paras[0]) || countWords(paras[0]) <= Math.max(60, words * 0.25));
  const keyPoints = parseJson(prompt.key_points, []) || [];
  const lower = answer.toLowerCase();
  const covered = keyPoints.map((k) => ({ point: k.point, part: k.part, hit: (k.keywords || [k.point]).some((w) => lower.includes(String(w).toLowerCase())) }));
  return { words, paragraphs: paras.length, bullets, headings, numbers, quotes: Math.floor(quotes), hasConclusion, hasIntro, covered,
    coverage: covered.length ? Math.round((100 * covered.filter((c) => c.hit).length) / covered.length) : null };
}

function heuristic(prompt, a, timeSpentSec) {
  const rubric = parseJson(prompt.rubric, DEFAULT_RUBRIC);
  const lenRatio = a.words / prompt.word_limit;
  const structure = Math.min(100, (a.hasIntro ? 30 : 0) + (a.hasConclusion ? 30 : 0) + Math.min(25, a.paragraphs * 6) + Math.min(15, (a.bullets + a.headings) * 5));
  const evidence = Math.min(100, a.numbers * 20 + a.quotes * 25);
  const scores = { content: a.coverage, structure, evidence, language: null };
  // Board creative questions (ক/খ/গ/ঘ): score each part by coverage of the key points tagged for it.
  const partCoverage = (key) => {
    const pts = a.covered.filter((c) => c.part === key);
    return pts.length ? Math.round((100 * pts.filter((c) => c.hit).length) / pts.length) : null;
  };
  const criteria = rubric.map((c) => ({
    key: c.key, label: c.label, weight: c.weight, score_pct: scores[c.key] ?? partCoverage(c.key),
    comment: {
      content: a.coverage == null ? 'মূল পয়েন্টের তালিকা না থাকায় স্বয়ংক্রিয়ভাবে যাচাই করা যায়নি।' : `প্রত্যাশিত ${toBn(a.covered.length)}টি মূল পয়েন্টের ${toBn(a.covered.filter((x) => x.hit).length)}টি উল্লেখ করেছেন।`,
      structure: `${a.hasIntro ? 'ভূমিকা আছে' : 'ভূমিকা স্পষ্ট নয়'}, ${a.hasConclusion ? 'উপসংহার আছে' : 'উপসংহার নেই'}; ${toBn(a.paragraphs)}টি অনুচ্ছেদ, ${toBn(a.bullets + a.headings)}টি শিরোনাম/পয়েন্ট।`,
      evidence: a.numbers || a.quotes ? `${toBn(a.numbers)}টি তথ্য/সংখ্যা ও ${toBn(a.quotes)}টি উদ্ধৃতি ব্যবহার করেছেন।` : 'কোনো তথ্য, পরিসংখ্যান বা উদ্ধৃতি নেই।',
      language: 'ভাষার মান ও যুক্তির গভীরতা স্বয়ংক্রিয়ভাবে নির্ভরযোগ্যভাবে মূল্যায়ন করা যায় না — বিশেষজ্ঞ রিভিউ নিন।',
    }[c.key] || (partCoverage(c.key) == null ? 'স্বয়ংক্রিয়ভাবে যাচাই করা যায়নি।' : `এই অংশের প্রত্যাশিত পয়েন্টের ${toBn(partCoverage(c.key))}% এসেছে।`),
  }));
  const improvements = [];
  if (lenRatio < 0.6) improvements.push(`উত্তর ছোট — প্রায় ${toBn(prompt.word_limit)} শব্দের লক্ষ্য, লিখেছেন ${toBn(a.words)}।`);
  if (lenRatio > 1.3) improvements.push('শব্দসীমার চেয়ে অনেক বড় — পরীক্ষায় সময় ঘাটতি হবে।');
  if (!a.hasIntro) improvements.push('শুরুতে ২-৩ বাক্যের ভূমিকা দিন।');
  if (!a.hasConclusion) improvements.push('শেষে একটি উপসংহার/সুপারিশ দিন।');
  if (a.bullets + a.headings === 0 && a.words > 150) improvements.push('উপ-শিরোনাম বা পয়েন্ট ব্যবহার করুন — পরীক্ষকের চোখে দ্রুত পড়ে।');
  if (!a.numbers) improvements.push('সাম্প্রতিক তথ্য-উপাত্ত (সাল, পরিসংখ্যান, সূত্র) যোগ করুন।');
  if (timeSpentSec && timeSpentSec > prompt.time_min * 60 * 1.25) improvements.push(`নির্ধারিত ${toBn(prompt.time_min)} মিনিটের চেয়ে বেশি সময় নিয়েছেন।`);
  const strengths = [];
  if (a.hasIntro && a.hasConclusion) strengths.push('ভূমিকা ও উপসংহারসহ পূর্ণাঙ্গ কাঠামো।');
  if (a.coverage >= 70) strengths.push('প্রত্যাশিত মূল পয়েন্টের বেশিরভাগ এসেছে।');
  if (a.numbers >= 2) strengths.push('তথ্য-উপাত্ত ব্যবহার করেছেন।');
  if (lenRatio >= 0.8 && lenRatio <= 1.2) strengths.push('দৈর্ঘ্য শব্দসীমার মধ্যে।');
  const scored = criteria.filter((c) => c.score_pct != null);
  const w = scored.reduce((s, c) => s + c.weight, 0);
  const pct = w ? scored.reduce((s, c) => s + c.weight * c.score_pct, 0) / w : null;
  return {
    engine: 'heuristic', criteria, strengths, improvements,
    missing_points: a.covered.filter((c) => !c.hit).map((c) => c.point),
    // Coverage in a very short answer is shallow: scale down below ~70% of the word limit.
    provisional_marks: pct == null ? null : Math.round((pct / 100) * Math.min(1, lenRatio / 0.7) * prompt.marks * 2) / 2,
    note: 'স্বয়ংক্রিয় প্রাথমিক বিশ্লেষণ: দৈর্ঘ্য, কাঠামো, মূল পয়েন্ট ও তথ্য-উপাত্ত দেখে। যুক্তির মান ও ভাষা বিচারে বিশেষজ্ঞ রিভিউ নিন।',
    stats: { words: a.words, paragraphs: a.paragraphs },
  };
}

const AiSchema = z.object({
  criteria: z.array(z.object({ key: z.string(), score_pct: z.number(), comment: z.string() })),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  missing_points: z.array(z.string()),
  overall_comment: z.string(),
});

const SYSTEM = `You are a strict, fair examiner for Bangladeshi written exams (BCS written, board creative questions, university admission written parts).
Evaluate the candidate's answer against the rubric, the expected key points and the model answer outline. Score each rubric criterion 0-100.
Write all feedback in Bangla (keep English quotations in English). Be specific: quote or point to the exact weak part and say how to fix it.
Do not invent facts; if the candidate states something factually doubtful, say it should be verified rather than asserting a correction you are unsure of.
Judge only what is written — do not reward length for its own sake.`;

export async function evaluateWritten(prompt, answer, timeSpentSec) {
  const a = analyse(answer, prompt);
  const rubric = parseJson(prompt.rubric, DEFAULT_RUBRIC);
  const ai = await structured({
    system: SYSTEM,
    user: JSON.stringify({
      question: prompt.prompt, marks: prompt.marks, word_limit: prompt.word_limit, time_limit_min: prompt.time_min,
      rubric: rubric.map(({ key, label, weight }) => ({ key, label, weight })),
      expected_key_points: (parseJson(prompt.key_points, []) || []).map((k) => k.point),
      model_answer_outline: prompt.model_answer || null,
      candidate_answer: answer,
      measured: { words: a.words, paragraphs: a.paragraphs, time_spent_min: Math.round((timeSpentSec || 0) / 60) },
    }),
    schema: AiSchema,
  });
  if (!ai) return heuristic(prompt, a, timeSpentSec);
  const byKey = new Map(ai.criteria.map((c) => [c.key, c]));
  const criteria = rubric.map((c) => ({ key: c.key, label: c.label, weight: c.weight, score_pct: Math.max(0, Math.min(100, Math.round(byKey.get(c.key)?.score_pct ?? 0))), comment: byKey.get(c.key)?.comment || '—' }));
  const pct = criteria.reduce((s, c) => s + c.weight * c.score_pct, 0) / criteria.reduce((s, c) => s + c.weight, 0);
  return {
    engine: 'ai', criteria, strengths: ai.strengths, improvements: ai.improvements, missing_points: ai.missing_points, overall: ai.overall_comment,
    provisional_marks: Math.round((pct / 100) * prompt.marks * 2) / 2,
    note: 'এআই মূল্যায়ন — অনুশীলনের জন্য নির্দেশক নম্বর। চূড়ান্ত মানদণ্ড হিসেবে বিশেষজ্ঞ রিভিউ নিন।',
    stats: { words: a.words, paragraphs: a.paragraphs },
  };
}
