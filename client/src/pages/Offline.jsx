// Offline practice: question sets saved on this device, taken and scored without internet.
// Lives outside the signed-in area so it still opens when the API can't be reached.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, tokenStore } from '../api.js';
import { ErrorBox, Empty } from '../components/ui.jsx';
import { bn, fmtDate } from '../utils.js';

const KEY = 'arohon_offline_sets';
const OPT = { a: 'ক', b: 'খ', c: 'গ', d: 'ঘ' };
const MAX_SETS = 10;

const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
const save = (sets) => {
  try { localStorage.setItem(KEY, JSON.stringify(sets)); return true; } catch { return false; }
};

function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true); const down = () => setOn(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return on;
}

function Downloader({ onAdd }) {
  const [subjects, setSubjects] = useState(null);
  const [subject, setSubject] = useState('');
  const [count, setCount] = useState(50);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { api.get('/catalog/subjects').then(setSubjects).catch((e) => setErr(e.message)); }, []);
  const download = async () => {
    setBusy(true); setErr(null);
    try { onAdd(await api.get(`/bank/offline-set?subject_id=${subject}&count=${count}`)); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="card stack">
      <h3>⬇️ নতুন সেট ডাউনলোড</h3>
      <ErrorBox error={err} />
      <div className="row">
        <select className="input" style={{ flex: 1, minWidth: 0 }} value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="বিষয়">
          <option value="">বিষয় বেছে নিন</option>{subjects?.map((s) => <option key={s.id} value={s.id}>{s.name_bn}</option>)}
        </select>
        <select className="input" style={{ width: 'auto' }} value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="প্রশ্নের সংখ্যা">
          {[25, 50, 100].map((n) => <option key={n} value={n}>{bn(n)} প্রশ্ন</option>)}
        </select>
        <button className="btn" disabled={!subject || busy} onClick={download}>{busy ? 'নামছে…' : 'ডাউনলোড'}</button>
      </div>
    </div>
  );
}

function Quiz({ set, onDone, onExit }) {
  const [answers, setAnswers] = useState({});
  const [done, setDone] = useState(false);
  const qs = set.questions;
  const correct = qs.filter((q) => answers[q.id] === q.correct_option).length;
  const wrong = qs.filter((q) => answers[q.id] && answers[q.id] !== q.correct_option).length;
  const finish = () => { setDone(true); onDone({ at: new Date().toISOString(), correct, wrong, total: qs.length }); window.scrollTo(0, 0); };
  return (
    <div className="stack">
      <div className="card row between" style={{ position: 'sticky', top: 8, zIndex: 5 }}>
        <b>{set.title}</b>
        {done ? <span className="badge good">{bn(correct)}/{bn(qs.length)} সঠিক · ভুল {bn(wrong)}</span> : <span className="small">{bn(Object.keys(answers).length)}/{bn(qs.length)} উত্তর</span>}
        {done ? <button className="btn light sm" onClick={onExit}>← সেট তালিকা</button> : <button className="btn sm" onClick={finish}>জমা দিন</button>}
      </div>
      {qs.map((q, i) => (
        <div key={q.id} className="card">
          <div className="tiny muted">{q.subject}{q.exam_ref ? ` · ${q.exam_ref}` : ''}</div>
          <b>{bn(i + 1)}. {q.body}</b>
          <div className="grid g2 mt">{['a', 'b', 'c', 'd'].map((k) => {
            const tone = !done ? '' : k === q.correct_option ? 'tone-good' : k === answers[q.id] ? 'tone-bad' : '';
            return (
              <button key={k} type="button" disabled={done} className={`chip ${answers[q.id] === k ? 'active' : ''} ${tone}`} style={{ textAlign: 'left', borderRadius: 10 }}
                onClick={() => setAnswers((a) => ({ ...a, [q.id]: k }))}>{done && k === q.correct_option ? '✓ ' : ''}{OPT[k]}. {q[`option_${k}`]}</button>
            );
          })}</div>
          {done && q.explanation && <div className="explain small mt">{q.explanation}</div>}
        </div>
      ))}
    </div>
  );
}

export default function Offline() {
  const online = useOnline();
  const [sets, setSets] = useState(load);
  const [active, setActive] = useState(null);
  const [err, setErr] = useState(null);
  const signedIn = !!tokenStore.get();

  const add = (set) => {
    const next = [{ ...set, id: Date.now(), results: [] }, ...sets].slice(0, MAX_SETS);
    if (!save(next)) { setErr('ডিভাইসে জায়গা নেই — পুরোনো সেট মুছে আবার চেষ্টা করুন।'); return; }
    setErr(null); setSets(next);
  };
  const remove = (id) => { const next = sets.filter((s) => s.id !== id); save(next); setSets(next); };
  const record = (id, result) => { const next = sets.map((s) => (s.id === id ? { ...s, results: [result, ...(s.results || [])].slice(0, 20) } : s)); save(next); setSets(next); };

  return (
    <div className="container" style={{ maxWidth: 860, padding: '1.2rem 1.1rem 3rem' }}>
      <div className="row between mb">
        <Link to={signedIn ? '/app' : '/'} className="brand" style={{ color: 'var(--navy)', padding: 0 }}><span className="logo">⛰️</span>আরোহণ</Link>
        <span className={`badge ${online ? 'good' : 'mid'}`}>{online ? '● অনলাইন' : '○ অফলাইন'}</span>
      </div>
      {active ? <Quiz set={active} onDone={(r) => record(active.id, r)} onExit={() => setActive(null)} /> : (
        <div className="stack">
          <div className="page-head"><div><h1>📴 অফলাইন অনুশীলন</h1><p>প্রশ্নের সেট এই ডিভাইসে রেখে দিন — ইন্টারনেট ছাড়াই পরীক্ষা ও ব্যাখ্যা পড়া চলবে।</p></div></div>
          <ErrorBox error={err} />
          {online && signedIn ? <Downloader onAdd={add} />
            : <div className="card small muted">{!online ? 'নতুন সেট নামাতে ইন্টারনেট লাগবে। আগে নামানো সেটগুলো নিচে আছে।' : <><Link to="/login">লগইন করে</Link> নতুন সেট ডাউনলোড করুন।</>}</div>}
          {!sets.length ? <div className="card"><Empty icon="📦" title="এই ডিভাইসে কোনো সেট নেই" /></div> : sets.map((s) => (
            <div key={s.id} className="card row between">
              <div>
                <b>{s.title}</b>
                <div className="tiny muted">{bn(s.questions.length)} প্রশ্ন · নামানো {fmtDate(s.created_at)}
                  {s.results?.[0] && ` · শেষবার ${bn(s.results[0].correct)}/${bn(s.results[0].total)}`}</div>
              </div>
              <div className="row">
                <button className="btn sm" onClick={() => { setActive(s); window.scrollTo(0, 0); }}>শুরু করুন</button>
                <button className="btn light sm" onClick={() => remove(s.id)} aria-label={`${s.title} মুছুন`}>মুছুন</button>
              </div>
            </div>
          ))}
          <p className="tiny muted center">সর্বোচ্চ {bn(MAX_SETS)}টি সেট রাখা যায়। অফলাইনের ফলাফল শুধু এই ডিভাইসে থাকে — রেডিনেস ও মেধাতালিকায় যোগ হয় না।</p>
        </div>
      )}
    </div>
  );
}
