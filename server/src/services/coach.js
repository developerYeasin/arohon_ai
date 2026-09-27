// Personal AI Exam Coach. Every answer is grounded in the student's own readiness data.
// A deterministic rule engine always works; if ANTHROPIC_API_KEY is set, Claude writes the
// reply using the same data as context, and the rule engine still supplies the action buttons.
import Anthropic from '@anthropic-ai/sdk';
import { query } from '../db.js';
import { readiness, getMission, dueReviewIds } from './engine.js';
import { dhakaToday, daysBetween, pct, toBn } from './util.js';

const bnNum = (n) => String(n).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);
const toAscii = (s) => s.replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d));

async function improvement(userId) {
  const rows = await query(
    `SELECT SUM(CASE WHEN created_at >= NOW() - INTERVAL 7 DAY THEN is_correct END) c1,
            SUM(CASE WHEN created_at >= NOW() - INTERVAL 7 DAY AND selected_option IS NOT NULL THEN 1 END) n1,
            SUM(CASE WHEN created_at < NOW() - INTERVAL 7 DAY AND created_at >= NOW() - INTERVAL 28 DAY THEN is_correct END) c0,
            SUM(CASE WHEN created_at < NOW() - INTERVAL 7 DAY AND created_at >= NOW() - INTERVAL 28 DAY AND selected_option IS NOT NULL THEN 1 END) n0
       FROM attempt_answers WHERE user_id=?`, [userId]);
  const r = rows[0];
  return { recent: r.n1 ? pct(Number(r.c1), Number(r.n1)) : null, recentN: Number(r.n1 || 0), before: r.n0 ? pct(Number(r.c0), Number(r.n0)) : null, beforeN: Number(r.n0 || 0) };
}

export async function buildContext(user) {
  const [ready, mission, due, imp] = await Promise.all([readiness(user), getMission(user), dueReviewIds(user.id, 100), improvement(user.id)]);
  const daysLeft = ready?.exam?.next_exam_date ? daysBetween(dhakaToday(), ready.exam.next_exam_date) : null;
  return { user: { name: user.name, track: user.track, daily_minutes: user.daily_minutes, streak: user.streak }, readiness: ready, mission, due_reviews: due.length, improvement: imp, days_left: daysLeft };
}

function detectIntent(text) {
  const t = toAscii(text.toLowerCase());
  const days = t.match(/(\d+)\s*(দিন|day)/);
  const hours = t.match(/(\d+(?:\.\d+)?)\s*(ঘণ্টা|ঘন্টা|hour|hr)/);
  const mins = t.match(/(\d+)\s*(মিনিট|min)/);
  if (/বাদ|stop|skip|ছেড়ে/.test(t) && days) return { intent: 'cut', days: Number(days[1]) };
  if (days) return { intent: 'countdown', days: Number(days[1]) };
  if (hours || mins) return { intent: 'session', minutes: hours ? Math.round(Number(hours[1]) * 60) : Number(mins[1]) };
  if (/আজ|today|কী পড়|কি পড়|what should i study/.test(t)) return { intent: 'today' };
  if (/হারাচ্|losing|কেন ভুল|why.*(wrong|mark)/.test(t)) return { intent: 'losing' };
  if (/রিভাই|রিভিশন|revise|revision/.test(t)) return { intent: 'revise' };
  if (/উন্নতি|improv|এগোচ্|progress/.test(t)) return { intent: 'improving' };
  if (/দুর্বল|weak/.test(t)) return { intent: 'weak' };
  if (/বারবার|repeated|ভুল গুলো|ভুলগুলো|mistake/.test(t)) return { intent: 'mistakes' };
  if (/কঠিন|harder|hard/.test(t)) return { intent: 'harder' };
  return { intent: 'general' };
}

function ruleReply(ctx, { intent, days, minutes }) {
  const r = ctx.readiness;
  const actions = [];
  const lines = [];
  if (!r || r.answers_used < 20) {
    return { text: 'আপনার সম্পর্কে এখনো যথেষ্ট তথ্য নেই। ২০ প্রশ্নের একটি ডায়াগনস্টিক টেস্ট দিন — তারপর আমি আপনার দুর্বল টপিক, গতি আর ভুলের ধরন দেখে নির্দিষ্ট পরামর্শ দিতে পারব।',
      actions: [{ type: 'adaptive', label: 'ডায়াগনস্টিক টেস্ট শুরু করুন', count: 20 }] };
  }
  const weak = r.weak_topics.slice(0, 3);
  const weakNames = weak.map((w) => `${w.name} (${w.accuracy}%)`).join(', ');
  switch (intent) {
    case 'today': {
      const todo = ctx.mission.items.filter((i) => !i.done);
      lines.push(todo.length ? 'আজকের মিশন:' : 'আজকের মিশন সম্পন্ন! চাইলে অতিরিক্ত অনুশীলন করতে পারেন।');
      todo.forEach((i, k) => lines.push(`${bnNum(k + 1)}. ${i.title} — আনুমানিক ${bnNum(i.minutes)} মিনিট`));
      if (r.recommended_action) lines.push('', `অগ্রাধিকার: ${r.recommended_action.text}`);
      actions.push({ type: 'mission', label: 'মিশন খুলুন' });
      break;
    }
    case 'losing': {
      lines.push(`আপনার আনুমানিক প্রাপ্ত নম্বর ${r.projected_marks}/${r.exam.total_questions}। নম্বর হারানোর প্রধান কারণ:`);
      r.mistake_mix.slice(0, 4).forEach((m) => lines.push(`• ${m.label} — ${bnNum(m.count)}টি`));
      if (r.biggest_risk) lines.push('', `সবচেয়ে বড় ঝুঁকি: ${r.biggest_risk.text}`);
      actions.push({ type: 'mistakes', label: 'ভুলের বিশ্লেষণ দেখুন' });
      break;
    }
    case 'revise':
      lines.push(`আজ রিভিশনের জন্য ${bnNum(ctx.due_reviews)}টি প্রশ্ন নির্ধারিত আছে (আগে ভুল করেছেন, এখন ভুলে যাওয়ার সম্ভাবনা বেশি).`);
      if (weak.length) lines.push(`টপিক হিসেবে রিভাইজ করুন: ${weakNames}`);
      actions.push({ type: 'revision', label: 'রিভিশন শুরু করুন' });
      break;
    case 'improving': {
      const i = ctx.improvement;
      if (i.recent == null || i.before == null) lines.push('তুলনা করার মতো দুই সময়ের ডেটা এখনো নেই — আরও কয়েক দিন অনুশীলন করুন।');
      else {
        const d = i.recent - i.before;
        lines.push(`গত ৭ দিনে নির্ভুলতা ${i.recent}% (${bnNum(i.recentN)} উত্তর), আগের ৩ সপ্তাহে ছিল ${i.before}% (${bnNum(i.beforeN)} উত্তর)।`);
        lines.push(d >= 3 ? `হ্যাঁ, আপনি উন্নতি করছেন (+${d})।` : d <= -3 ? `নির্ভুলতা ${-d} পয়েন্ট কমেছে — সম্ভবত কঠিন প্রশ্ন বেশি এসেছে, অথবা রিভিশন কম হচ্ছে।` : 'পারফরম্যান্স স্থিতিশীল। উন্নতির জন্য দুর্বল টপিকে ফোকাস বাড়ান।');
      }
      lines.push(`সামগ্রিক রেডিনেস: ${r.overall}%`);
      actions.push({ type: 'analytics', label: 'বিস্তারিত অ্যানালিটিক্স' });
      break;
    }
    case 'weak':
      lines.push(weak.length ? `আপনি পুরো বিষয়ে দুর্বল নন — নির্দিষ্টভাবে দুর্বল: ${weakNames}` : 'এখনো কোনো টপিকে স্পষ্ট দুর্বলতা পাওয়া যায়নি।');
      if (r.weakest_subject) lines.push(`সবচেয়ে কম প্রস্তুত বিষয়: ${r.weakest_subject.name} (${r.weakest_subject.readiness}%)`);
      if (weak.length) actions.push({ type: 'adaptive', label: 'এই টপিকগুলোতে টেস্ট দিন', topicIds: weak.map((w) => w.id), count: 20 });
      break;
    case 'mistakes':
      lines.push(`আপনার বারবার ভুল হওয়া প্রশ্নগুলো নিয়ে একটি টেস্ট তৈরি করছি।`);
      actions.push({ type: 'mistakes_test', label: 'শুধু বারবার ভুল প্রশ্নে টেস্ট', count: 20 });
      break;
    case 'harder':
      lines.push('আপনার শক্তিশালী টপিক থেকে কঠিন প্রশ্ন বেছে দিচ্ছি।');
      actions.push({ type: 'adaptive', label: '২০টি কঠিন প্রশ্ন', count: 20, focus: 'hard' });
      break;
    case 'session':
      lines.push(`${bnNum(minutes)} মিনিটের জন্য সবচেয়ে কার্যকর সেশন: আগে ভুলের রিভিশন, তারপর দুর্বল টপিকে টার্গেটেড প্রশ্ন।`);
      actions.push({ type: 'session', label: `${bnNum(minutes)} মিনিটের সেশন শুরু করুন`, minutes });
      break;
    case 'countdown':
    case 'cut': {
      const d = days;
      const sorted = [...r.subjects].filter((s) => s.attempts > 0);
      const byValue = [...r.subjects].sort((a, b) => (b.questions * (100 - b.readiness)) - (a.questions * (100 - a.readiness)));
      lines.push(`${bnNum(d)} দিনের পরিকল্পনা (${r.exam.name}):`);
      if (d <= 10) {
        lines.push('• নতুন বড় টপিক শুরু করবেন না — যা জানেন তা পাকা করুন।');
        const low = byValue.filter((s) => s.questions <= 15 && s.readiness < 30);
        if (intent === 'cut' || low.length) lines.push(`• কম নম্বরের ও এখনো শুরু না-করা অংশ বাদ দেওয়া যায়: ${low.map((s) => s.name).join(', ') || 'নেই'}`);
        lines.push(`• প্রতিদিন: ভুলের রিভিশন + ১টি পূর্ণাঙ্গ/মিনি মডেল টেস্ট + দুর্বল টপিক (${weak.map((w) => w.name).join(', ') || '—'})`);
        lines.push('• শেষ ২ দিন: শুধু রিভিশন ও বিশ্রাম।');
      } else {
        lines.push(`• প্রথম ${bnNum(Math.round(d * 0.5))} দিন: সর্বোচ্চ নম্বরের দুর্বল বিষয় — ${byValue.slice(0, 3).map((s) => `${s.name} (${s.questions} নম্বর, ${s.readiness}%)`).join(', ')}`);
        lines.push(`• পরের ${bnNum(Math.round(d * 0.3))} দিন: প্রতি ২ দিনে ১টি মডেল টেস্ট + ভুল বিশ্লেষণ`);
        lines.push(`• শেষ ${bnNum(Math.max(2, Math.round(d * 0.2)))} দিন: রিভিশন ও পূর্ণাঙ্গ সিমুলেশন`);
      }
      if (sorted.length === 0) lines.push('(বিষয়ভিত্তিক ডেটা কম — প্রথমে একটি মডেল টেস্ট দিন।)');
      actions.push({ type: 'mock', label: 'মডেল টেস্ট দিন' });
      break;
    }
    default:
      lines.push(`আপনার ${r.exam.name} রেডিনেস এখন ${r.overall}%। আনুমানিক নম্বর: ${r.projected_marks}/${r.exam.total_questions}।`);
      if (weak.length) lines.push(`দুর্বল টপিক: ${weakNames}`);
      if (r.biggest_risk) lines.push(`সবচেয়ে বড় ঝুঁকি: ${r.biggest_risk.text}`);
      lines.push(`পরামর্শ: ${r.recommended_action.text}`);
  }
  return { text: toBn(lines.join('\n')), actions };
}

let client = null;
const claude = () => (process.env.ANTHROPIC_API_KEY ? (client ??= new Anthropic()) : null);

const SYSTEM = `You are "আরোহণ কোচ", a personal exam-preparation coach for Bangladeshi students (Academic, university Admission, and Job/BCS/Bank/Primary/NTRCA exams).
Reply in Bangla unless the student writes in English. Be concrete, warm and brief (under 180 words), using short lines or bullets.
Ground every claim in the STUDENT DATA JSON provided: cite their real subject/topic names, percentages, due-revision count and days left.
Never invent statistics, never promise a guaranteed pass, and never say a specific question "will definitely come" — say "frequently tested" or "high-priority" instead.
If the data is thin, say so and suggest a diagnostic test. You may explain MCQ concepts when asked.`;

export async function coachReply(user, message, { allowLLM = true } = {}) {
  const ctx = await buildContext(user);
  const intent = detectIntent(message);
  const rule = ruleReply(ctx, intent);
  const c = allowLLM ? claude() : null;
  if (!c) return rule;
  try {
    const history = (await query('SELECT role, content FROM coach_messages WHERE user_id=? ORDER BY id DESC LIMIT 10', [user.id])).reverse();
    const response = await c.beta.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-opus-5',
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: SYSTEM,
      messages: [
        ...history.map((h) => ({ role: h.role, content: h.content })),
        { role: 'user', content: `STUDENT DATA:\n${JSON.stringify(ctx)}\n\nSTUDENT MESSAGE:\n${message}` },
      ],
    });
    if (response.stop_reason === 'refusal') return rule;
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    return { text: text || rule.text, actions: rule.actions };
  } catch (e) {
    console.error('Claude coach error:', e.message);
    return rule;
  }
}
