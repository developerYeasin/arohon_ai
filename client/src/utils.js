const BN = '০১২৩৪৫৬৭৮৯';
export const bn = (v) => (v == null ? '—' : String(v).replace(/\d/g, (d) => BN[d]));
export const pctText = (v) => (v == null ? '—' : `${bn(v)}%`);

export const TRACKS = {
  academic: { bn: 'একাডেমিক', desc: 'স্কুল-কলেজ ও বোর্ড পরীক্ষা', icon: '📘' },
  admission: { bn: 'ভর্তি', desc: 'বিশ্ববিদ্যালয়, মেডিকেল ও গুচ্ছ', icon: '🎓' },
  job: { bn: 'চাকরি', desc: 'বিসিএস, ব্যাংক, প্রাইমারি, NTRCA', icon: '💼' },
};

export const DISTRICTS = ['ঢাকা', 'চট্টগ্রাম', 'রাজশাহী', 'খুলনা', 'বরিশাল', 'সিলেট', 'রংপুর', 'ময়মনসিংহ', 'কুমিল্লা', 'গাজীপুর', 'নারায়ণগঞ্জ', 'বগুড়া',
  'যশোর', 'দিনাজপুর', 'কক্সবাজার', 'নোয়াখালী', 'ফরিদপুর', 'টাঙ্গাইল', 'পাবনা', 'কুষ্টিয়া', 'জামালপুর', 'নরসিংদী', 'ব্রাহ্মণবাড়িয়া', 'চাঁদপুর', 'অন্যান্য'];

export function fmtDuration(sec) {
  if (sec == null) return '—';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return bn(h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`);
}

export function fmtDate(d, withTime = false) {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short', year: 'numeric', ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}) });
}

export const scoreTone = (v) => (v == null ? 'muted' : v >= 70 ? 'good' : v >= 45 ? 'mid' : 'bad');

export const KIND_LABEL = {
  practice: 'অনুশীলন', adaptive: 'অ্যাডাপটিভ', mock: 'মডেল টেস্ট', live: 'লাইভ', mission: 'মিশন', revision: 'রিভিশন',
  mistakes: 'ভুলের রি-টেস্ট', current_affairs: 'সাম্প্রতিক', challenge: 'চ্যালেঞ্জ', session: 'সেশন',
};
