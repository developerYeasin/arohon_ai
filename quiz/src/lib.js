const BASE = (import.meta.env.VITE_API_URL || '') + '/api/public';
export const APP_URL = (import.meta.env.VITE_APP_URL || 'http://localhost:5173').replace(/\/$/, '');

export async function api(path, body) {
  let res;
  try {
    res = await fetch(BASE + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  } catch {
    throw new Error('ইন্টারনেট সংযোগ নেই — আবার চেষ্টা করুন');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || 'কিছু একটা ভুল হয়েছে');
  return data;
}

const BN = '০১২৩৪৫৬৭৮৯';
export const bn = (v) => (v == null ? '—' : String(v).replace(/\d/g, (d) => BN[d]));
export const LETTER = { a: 'ক', b: 'খ', c: 'গ', d: 'ঘ' };
export const TRACKS = { job: ['💼', 'চাকরি', 'বিসিএস · ব্যাংক · প্রাইমারি'], admission: ['🎓', 'ভর্তি', 'ঢাবি · মেডিকেল · গুচ্ছ'], academic: ['📘', 'একাডেমিক', 'এসএসসি · এইচএসসি'] };
export const fmtTime = (s) => bn(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);

// localStorage can throw (private mode); treat it as optional.
export const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};

export const signupUrl = (source) => `${APP_URL}/register?utm_source=quiz&utm_medium=${encodeURIComponent(source)}`;
