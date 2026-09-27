import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useFetch, Loader, ErrorBox, Bar } from '../components/ui.jsx';
import { bn, fmtDate } from '../utils.js';
import { ReferralCard } from './Social.jsx';
import { PRO_FEATURES, FREE_FEATURES } from '../features.js';

const STATUS = { pending: ['যাচাই চলছে', 'mid'], paid: ['সফল', 'good'], failed: ['ব্যর্থ', 'bad'], cancelled: ['বাতিল', 'gray'], rejected: ['প্রত্যাখ্যাত', 'bad'], refunded: ['ফেরত দেওয়া হয়েছে', 'gray'] };
const METHOD = { bkash_gateway: 'bKash', manual_bkash: 'bKash (ম্যানুয়াল)', manual_nagad: 'Nagad', manual_rocket: 'Rocket', demo: 'ডেমো' };
const RESULT = {
  success: ['good', '✅ পেমেন্ট সফল! আপনার এক্সাম পাস চালু হয়েছে।'],
  failed: ['error', 'পেমেন্ট সম্পন্ন হয়নি। টাকা কাটা গেলে ৭২ ঘণ্টার মধ্যে ফেরত যাবে, অথবা আমাদের জানান।'],
  cancelled: ['warn', 'আপনি পেমেন্ট বাতিল করেছেন।'],
};

export default function Billing() {
  const { refresh } = useAuth();
  const [params] = useSearchParams();
  const { data: me, loading, reload } = useFetch('/billing/me');
  const { data: catalog } = useFetch('/billing/plans');
  const [plan, setPlan] = useState('pass_3m');
  const [method, setMethod] = useState(null);
  const [trx, setTrx] = useState('');
  const [sender, setSender] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  if (loading || !me || !catalog) return <Loader />;
  const a = me.access;
  const methods = me.methods;
  const m = methods.find((x) => x.code === method) || methods[0];
  const selected = catalog.plans.find((p) => p.code === plan) || catalog.plans[0];
  const result = RESULT[params.get('payment')];
  const daysLeft = a.until ? Math.max(0, Math.ceil((new Date(a.until) - Date.now()) / 86400000)) : null;

  const pay = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const d = await api.post('/billing/checkout', { plan: selected.code, method: m.code, trx_id: trx, sender_number: sender });
      if (d.status === 'redirect') { window.location.href = d.url; return; }
      if (d.status === 'paid') setMsg('✅ এক্সাম পাস চালু হয়েছে!');
      if (d.status === 'pending') setMsg('✅ পেমেন্টের তথ্য জমা হয়েছে। সাধারণত কয়েক ঘণ্টার মধ্যে যাচাই করে পাস চালু করা হয় — নিচে অবস্থা দেখতে পাবেন।');
      setTrx(''); setSender(''); reload(); refresh();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  return (
    <div className="stack">
      <div className="page-head"><div><h1>💳 এক্সাম পাস ও পেমেন্ট</h1><p>স্বচ্ছ শর্ত, কোনো লুকানো চার্জ বা অটো-রিনিউ নেই। <Link to="/terms">শর্তাবলি ও রিফান্ড নীতি</Link></p></div></div>
      {result && <div className={`alert ${result[0]}`}>{result[1]}</div>}
      {msg && <div className="alert good">{msg}</div>}
      <ErrorBox error={err} />

      <div className="grid g-main">
        <div className="card hero-card">
          <div className="muted small">বর্তমান প্যাকেজ</div>
          <h2 style={{ margin: '.2rem 0' }}>
            {a.tier === 'pro' ? `⭐ ${a.plan_name}` : a.tier === 'trial' ? '🎁 ফ্রি ট্রায়াল (সব ফিচার)' : a.tier === 'staff' ? 'স্টাফ অ্যাকাউন্ট' : 'ফ্রি প্যাকেজ'}
          </h2>
          {a.until && <div className="small">মেয়াদ: {fmtDate(a.until)} পর্যন্ত · আর {bn(daysLeft)} দিন</div>}
          {a.tier === 'free' && <div className="small muted">অনুশীলন, লাইভ এক্সাম ও ব্যাখ্যা সবসময় ফ্রি। ব্যক্তিগত বিশ্লেষণের জন্য এক্সাম পাস নিন।</div>}
          {a.tier === 'trial' && <div className="small muted">ট্রায়াল শেষ হলে স্বয়ংক্রিয়ভাবে কোনো টাকা কাটবে না — ফ্রি প্যাকেজে চলে যাবেন।</div>}
          {a.tier === 'pro' && <div className="small muted">মেয়াদ শেষের আগে নবায়ন করলে বাকি দিন যোগ হয়ে যাবে।</div>}
        </div>
        {me.usage && (
          <div className="card">
            <h3>আজকের ফ্রি ব্যবহার</h3>
            {[['অ্যাডাপটিভ টেস্ট', me.usage.adaptive, me.free_limits.adaptive_per_day], ['মিনি মডেল টেস্ট', me.usage.mock, me.free_limits.mock_per_day],
              ['রিভিশন সেশন', me.usage.revision, me.free_limits.revision_per_day], ['কোচ প্রশ্ন', me.usage.coach, me.free_limits.coach_per_day]].map(([l, u, lim]) => (
              <div key={l} className="usage-row"><span>{l}</span><Bar value={(Math.min(u, lim) / lim) * 100} tone={u >= lim ? 'bad' : 'good'} /><span className="small">{bn(Math.min(u, lim))}/{bn(lim)}</span></div>
            ))}
            <p className="tiny muted mt">প্রতিদিন রাত ১২টায় (বাংলাদেশ সময়) রিসেট হয়।</p>
          </div>
        )}
      </div>

      <div className="card">
        <h3>১. প্যাকেজ বেছে নিন</h3>
        <div className="grid g4">
          {catalog.plans.map((p) => (
            <button key={p.code} className={`card plan-card ${selected.code === p.code ? 'on' : ''}`} onClick={() => setPlan(p.code)} aria-pressed={selected.code === p.code}>
              {p.highlight && <span className="badge accent">{p.highlight}</span>}
              <div className="mt" style={{ fontWeight: 600 }}>{p.name_bn}</div>
              <div className="price">৳{bn(p.price_bdt)}</div>
              <div className="tiny muted">দৈনিক প্রায় ৳{bn((p.price_bdt / p.duration_days).toFixed(1))}</div>
            </button>
          ))}
        </div>
        <div className="grid g2 mt">
          <div><b className="small">এক্সাম পাসে যা পাবেন</b><ul className="small" style={{ paddingLeft: '1.1rem' }}>{PRO_FEATURES.map((f) => <li key={f}>{f}</li>)}</ul></div>
          <div><b className="small">যা সবসময় ফ্রি থাকবে</b><ul className="small muted" style={{ paddingLeft: '1.1rem' }}>{FREE_FEATURES.map((f) => <li key={f}>{f}</li>)}</ul></div>
        </div>
      </div>

      <div className="card">
        <h3>২. পেমেন্ট করুন — ৳{bn(selected.price_bdt)}</h3>
        {!methods.length ? <div className="alert warn">এই মুহূর্তে অনলাইন পেমেন্ট চালু নেই। শিগগিরই চালু হবে।</div> : <>
          <div className="chips mb">{methods.map((x) => <button key={x.code} className={`chip ${m.code === x.code ? 'active' : ''}`} onClick={() => setMethod(x.code)}>{x.label}</button>)}</div>
          {m.auto ? (
            <div>
              <p className="small muted">{m.code === 'demo' ? 'ডেভেলপমেন্ট মোড: বাস্তব টাকা ছাড়াই সঙ্গে সঙ্গে পাস চালু হবে।' : 'বোতাম চাপলে bKash-এর নিরাপদ পেজে যাবেন; পেমেন্ট শেষে স্বয়ংক্রিয়ভাবে এখানে ফিরে আসবেন এবং পাস চালু হবে।'}</p>
              <button className="btn accent lg" onClick={pay} disabled={busy}>{busy ? 'অপেক্ষা করুন…' : `৳${bn(selected.price_bdt)} পেমেন্ট করুন`}</button>
            </div>
          ) : (
            <div className="grid g2">
              <ol className="pay-steps small">
                <li>{m.label.split(' ')[0]} অ্যাপ থেকে <b>Send Money</b> করুন এই নম্বরে: <b style={{ fontSize: '1.1rem' }}>{bn(m.number)}</b></li>
                <li>পরিমাণ: <b>৳{bn(selected.price_bdt)}</b> (রেফারেন্সে আপনার মোবাইল নম্বর লিখতে পারেন)</li>
                <li>SMS-এ পাওয়া <b>ট্রানজেকশন আইডি (TrxID)</b> ও যে নম্বর থেকে পাঠিয়েছেন তা পাশের ফর্মে দিন</li>
                <li>আমরা যাচাই করে সাধারণত কয়েক ঘণ্টার মধ্যে পাস চালু করব</li>
              </ol>
              <div>
                <div className="field"><label htmlFor="trx">ট্রানজেকশন আইডি (TrxID)</label><input id="trx" className="input" value={trx} onChange={(e) => setTrx(e.target.value)} placeholder="যেমন: 9ABC12DEF3" autoComplete="off" /></div>
                <div className="field"><label htmlFor="snd">যে নম্বর থেকে পাঠিয়েছেন</label><input id="snd" className="input" value={sender} onChange={(e) => setSender(e.target.value)} placeholder="01XXXXXXXXX" inputMode="numeric" /></div>
                <button className="btn accent block" onClick={pay} disabled={busy || !trx || !sender}>{busy ? 'জমা হচ্ছে…' : 'পেমেন্টের তথ্য জমা দিন'}</button>
              </div>
            </div>
          )}
        </>}
      </div>

      <ReferralCard />

      <div className="card table-wrap">
        <h3>পেমেন্টের ইতিহাস</h3>
        {!me.payments.length ? <p className="small muted">এখনো কোনো পেমেন্ট নেই।</p> : (
          <table className="table">
            <thead><tr><th>তারিখ</th><th>প্যাকেজ</th><th>পরিমাণ</th><th>পদ্ধতি</th><th>TrxID</th><th>অবস্থা</th></tr></thead>
            <tbody>{me.payments.map((p) => (
              <tr key={p.id}>
                <td className="small">{fmtDate(p.created_at, true)}</td><td>{p.plan_name}</td><td>৳{bn(p.amount_bdt)}</td><td className="small">{METHOD[p.method]}</td>
                <td className="small">{p.trx_id || '—'}</td>
                <td><span className={`badge ${STATUS[p.status][1]}`}>{STATUS[p.status][0]}</span>{p.admin_note && <div className="tiny muted">{p.admin_note}</div>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function Terms() {
  return (
    <div className="container" style={{ maxWidth: 820, padding: '2rem 1.1rem' }}>
      <Link to="/" className="brand" style={{ color: 'var(--navy)', padding: 0 }}><span className="logo">⛰️</span>আরোহণ</Link>
      <div className="card mt">
        <h1>শর্তাবলি ও রিফান্ড নীতি</h1>
        <h3 className="mt">সাবস্ক্রিপশন</h3>
        <ul>
          <li>এক্সাম পাস নির্দিষ্ট মেয়াদের এককালীন পেমেন্ট। <b>কোনো অটো-রিনিউ নেই</b> — মেয়াদ শেষে আপনি ফ্রি প্যাকেজে ফিরে যাবেন, কোনো টাকা কাটবে না।</li>
          <li>মেয়াদ থাকা অবস্থায় নবায়ন করলে নতুন মেয়াদ বর্তমান মেয়াদের শেষ থেকে যোগ হবে।</li>
          <li>নতুন অ্যাকাউন্টে ৭ দিনের ফ্রি ট্রায়াল — কোনো পেমেন্ট তথ্য লাগে না।</li>
        </ul>
        <h3 className="mt">যা কখনো পেইড হবে না</h3>
        <p>প্রশ্নের সঠিক উত্তর ও ব্যাখ্যা, ভুল প্রশ্ন রিপোর্ট করা, সংশোধনের ইতিহাস এবং লাইভ এক্সামে অংশগ্রহণ সবসময় ফ্রি।</p>
        <h3 className="mt">রিফান্ড নীতি</h3>
        <ul>
          <li>পেমেন্টের <b>৭ দিনের মধ্যে</b> রিফান্ড চাইলে পুরো টাকা ফেরত দেওয়া হবে।</li>
          <li>টাকা কাটা গেছে কিন্তু পাস চালু হয়নি — এমন হলে যাচাই করে ৭২ ঘণ্টার মধ্যে পাস চালু বা টাকা ফেরত দেওয়া হবে।</li>
          <li>রিফান্ড যে মাধ্যমে পেমেন্ট করেছেন (bKash/Nagad/Rocket) সেখানেই পাঠানো হবে।</li>
        </ul>
        <h3 className="mt">আমরা যা প্রতিশ্রুতি দিই না</h3>
        <p>কোনো প্যাকেজ চাকরি, ভর্তি বা নির্দিষ্ট ফলাফলের নিশ্চয়তা দেয় না। র‍্যাংক ও স্কোর বাস্তব ব্যবহারকারীদের ডেটা থেকে তৈরি; আমরা কখনো ভুয়া র‍্যাংক বা সাফল্যের দাবি প্রকাশ করি না।</p>
        <p className="tiny muted mt">এই নীতি পরিবর্তন হলে কার্যকর হওয়ার আগে অ্যাপে জানানো হবে।</p>
      </div>
    </div>
  );
}
