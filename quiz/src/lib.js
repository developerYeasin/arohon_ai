const ROOT = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '').replace(/\/api$/, '') + '/api';

// localStorage can throw (private mode); treat it as optional.
export const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

export const session = {
  get token() { return store.get('qz_token'); },
  get user() { return store.get('qz_user'); },
  save(token, user) { store.set('qz_token', token); store.set('qz_user', user); },
  clear() { store.del('qz_token'); store.del('qz_user'); },
};

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  const headers = { 'Content-Type': 'application/json' };
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  try {
    res = await fetch(ROOT + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new Error('সার্ভারে সংযোগ হচ্ছে না — ইন্টারনেট দেখে আবার চেষ্টা করুন');
  }
  const data = await res.json().catch(() => null);
  if (res.status === 401 && session.token && !path.startsWith('/auth/')) { session.clear(); location.href = '/login'; }
  if (!res.ok) { const e = new Error(data?.error || 'কিছু একটা ভুল হয়েছে'); e.status = res.status; e.code = data?.code; throw e; }
  return data;
}

const BN = '০১২৩৪৫৬৭৮৯';
export const bn = (v) => (v == null ? '—' : String(v).replace(/\d/g, (d) => BN[d]));
export const num = (v) => bn(Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }));
export const LETTERS = ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ'];
export const OPTION_IDS = 'abcdefgh';
export const fmtTime = (s) => {
  s = Math.max(0, Math.round(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, '0');
  return bn(h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`);
};
export const fmtDate = (v) => (v ? new Date(v).toLocaleString('bn-BD', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }) : '—');
export const TYPES = { single: 'একটি সঠিক উত্তর', multi: 'একাধিক সঠিক উত্তর', text: 'লিখে উত্তর' };
export const examUrl = (code) => `${location.origin}/e/${code}`;

export function deviceId() {
  let d = store.get('qz_device');
  if (!d) { d = Math.random().toString(36).slice(2) + Date.now().toString(36); store.set('qz_device', d); }
  return d;
}

// Shrinks an uploaded image to a JPEG data URL so it can be stored with the question.
export function readImage(file, max = 1000) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('শুধু ছবি দেওয়া যাবে'));
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => reject(new Error('ছবিটি পড়া যায়নি'));
    img.src = URL.createObjectURL(file);
  });
}

// Bulk paste format — one block per question, blank line between blocks:
//   ১. প্রশ্ন        (numbering optional)
//   ক) অপশন   *খ) সঠিক অপশন   (a) b) … also fine; * marks correct, several * = multi)
//   উত্তর: ঢাকা | Dhaka           (no options → written answer)
//   ব্যাখ্যা: …
const OPT = /^\s*(\*)?\s*\(?([কখগঘঙচছজ]|[a-hA-H])[).।:]\s*(.*)$/;
const LETTER_IDX = (l) => { const i = LETTERS.indexOf(l); return i >= 0 ? i : OPTION_IDS.indexOf(l.toLowerCase()); };
export function parseBulk(text) {
  const blocks = text.replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((block, n) => {
    const q = { type: 'single', body: '', options: [], answer: [], explanation: '' };
    let answerLine = null;
    for (const raw of block.split('\n')) {
      const line = raw.trim(); if (!line) continue;
      const m = line.match(/^(উত্তর|উঃ|answer|ans)\s*[:：]\s*(.*)$/i);
      const e = line.match(/^(ব্যাখ্যা|explanation)\s*[:：]\s*(.*)$/i);
      const o = line.match(OPT);
      if (m) answerLine = m[2].trim();
      else if (e) q.explanation = e[2].trim();
      else if (o && q.body) {
        const id = OPTION_IDS[q.options.length];
        q.options.push({ id, text: o[3].trim() });
        if (o[1]) q.answer.push(id);
      } else if (!q.options.length) q.body += (q.body ? '\n' : '') + line.replace(/^\s*[০-৯\d]+\s*[.)।]\s*/, '');
    }
    if (!q.options.length) {
      q.type = 'text'; q.options = null;
      q.answer = (answerLine || '').split('|').map((s) => s.trim()).filter(Boolean);
    } else if (!q.answer.length && answerLine) {
      q.answer = answerLine.split(/[,\s]+/).map((l) => OPTION_IDS[LETTER_IDX(l.replace(/[()]/g, ''))]).filter(Boolean);
    }
    if (q.options && q.answer.length > 1) q.type = 'multi';
    q.error = !q.body ? 'প্রশ্ন নেই' : q.options && q.options.length < 2 ? 'অপশন কম' : !q.answer.length ? 'সঠিক উত্তর নেই' : null;
    q.n = n + 1;
    return q;
  });
}

export function toCsv(rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\n');
}
