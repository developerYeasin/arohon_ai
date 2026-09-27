// Mistake Intelligence: every wrong answer is classified, and each class gets a different remedy.
export const MISTAKE_TYPES = {
  didnt_know:    { bn: 'জানা ছিল না',          remedy: 'ব্যাখ্যা পড়ুন, তারপর এই টপিকের ১০টি ভিত্তি প্রশ্ন অনুশীলন করুন।', action: 'concept' },
  forgot:        { bn: 'ভুলে গেছি',            remedy: 'আগে সঠিক করেছিলেন — স্পেসড রিভিশন সাইকেলে (১-৩-৭ দিন) আবার আসবে।', action: 'revision' },
  misread:       { bn: 'প্রশ্ন ভুল পড়েছি',      remedy: '"না/নয়/ব্যতিক্রম" শব্দ চিহ্নিত করে ধীরে পড়ার ড্রিল দিন।', action: 'accuracy_drill' },
  confused:      { bn: 'দুটি ধারণা গুলিয়েছি',   remedy: 'নিশ্চিত হয়েও ভুল — ধারণাগত বিভ্রান্তি। পাশাপাশি তুলনা করে ব্যাখ্যা পড়ুন।', action: 'concept' },
  careless:      { bn: 'অসাবধানতা',            remedy: 'জানেন কিন্তু তাড়াহুড়োয় ভুল — সময় বেঁধে নির্ভুলতার ড্রিল করুন।', action: 'accuracy_drill' },
  time_pressure: { bn: 'সময়ের চাপ',             remedy: 'শেষ দিকে তাড়াহুড়ো — গতি বাড়াতে ছোট টাইমড সেট অনুশীলন করুন।', action: 'speed_drill' },
  guessing:      { bn: 'আন্দাজে উত্তর',          remedy: 'নেগেটিভ মার্কিং আছে — ৫০/৫০ করতে না পারলে বাদ দিন।', action: 'concept' },
  calculation:   { bn: 'হিসাবে ভুল',            remedy: 'পদ্ধতি ঠিক, হিসাব ভুল — শর্টকাট ও যাচাই কৌশল অনুশীলন করুন।', action: 'accuracy_drill' },
  overthinking:  { bn: 'বেশি ভেবেছি',           remedy: 'প্রয়োজনের চেয়ে অনেক বেশি সময় নিয়েছেন — প্রথম যৌক্তিক উত্তরে আস্থা রাখার অনুশীলন করুন।', action: 'speed_drill' },
};

const CALC_SUBJECTS = new Set(['math', 'job-math', 'adm-physics', 'adm-math', 'aca-math', 'aca-physics', 'adm-chemistry', 'mental-ability']);

/**
 * Heuristic classifier. Uses per-answer telemetry: time spent vs. the target pace,
 * self-reported confidence, when in the exam it was answered, and the user's history.
 * Students can override the label; their override wins everywhere.
 */
export function classifyMistake({ timeMs, targetSec, confidence, answeredAtSec, durationSec, everCorrectBefore, subjectSlug, changedAnswer }) {
  const t = timeMs / 1000;
  if (confidence === 'guess') return 'guessing';
  if (everCorrectBefore) return 'forgot';
  if (durationSec > 0 && answeredAtSec != null && answeredAtSec > durationSec * 0.85 && t < targetSec * 0.6) return 'time_pressure';
  if (t > targetSec * 2.2 || changedAnswer) return 'overthinking';
  if (confidence === 'sure' && t < targetSec * 0.6) return 'careless';
  if (CALC_SUBJECTS.has(subjectSlug) && t >= targetSec * 0.8) return 'calculation';
  if (confidence === 'sure') return 'confused';
  if (t < targetSec * 0.3) return 'misread';
  return 'didnt_know';
}

export const effectiveType = (row) => row.mistake_type_user || row.mistake_type;
