import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, bn, deviceId, fmtDate, fmtTime, LETTERS, num, store } from './lib.js';
import { Modal } from './ui.jsx';

const DISTRICTS = 'বাগেরহাট বান্দরবান বরগুনা বরিশাল ভোলা বগুড়া ব্রাহ্মণবাড়িয়া চাঁদপুর চাঁপাইনবাবগঞ্জ চট্টগ্রাম চুয়াডাঙ্গা কুমিল্লা কক্সবাজার ঢাকা দিনাজপুর ফরিদপুর ফেনী গাইবান্ধা গাজীপুর গোপালগঞ্জ হবিগঞ্জ জামালপুর যশোর ঝালকাঠি ঝিনাইদহ জয়পুরহাট খাগড়াছড়ি খুলনা কিশোরগঞ্জ কুড়িগ্রাম কুষ্টিয়া লক্ষ্মীপুর লালমনিরহাট মাদারীপুর মাগুরা মানিকগঞ্জ মেহেরপুর মৌলভীবাজার মুন্সীগঞ্জ ময়মনসিংহ নওগাঁ নড়াইল নারায়ণগঞ্জ নরসিংদী নাটোর নেত্রকোণা নীলফামারী নোয়াখালী পাবনা পঞ্চগড় পটুয়াখালী পিরোজপুর রাজবাড়ী রাজশাহী রাঙ্গামাটি রংপুর সাতক্ষীরা শরীয়তপুর শেরপুর সিরাজগঞ্জ সুনামগঞ্জ সিলেট টাঙ্গাইল ঠাকুরগাঁও'.split(' ').sort((a, b) => a.localeCompare(b, 'bn'));

export default function Exam() {
  const { code } = useParams();
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState(null);
  const [sess, setSess] = useState(null);
  const key = `qz_exam_${code}`;

  useEffect(() => {
    api(`/forms/p/${code}`).then(setMeta).catch((e) => setErr(e.message));
    // Reopening the link mid-exam (refresh, closed tab) resumes the same attempt.
    if (store.get(key)) api(`/forms/p/${code}/start`, { method: 'POST', body: { device: deviceId() } }).then(setSess).catch(() => store.del(key));
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <div className="card center empty"><div className="big-ico">🔍</div><h3>{err}</h3><p className="muted small">লিংকটি ঠিক আছে কি না শিক্ষকের কাছে জেনে নিন।</p></div>;
  if (!meta) return <div className="loader" />;
  if (sess?.status === 'in_progress') return <Taking meta={meta} sess={sess} storeKey={key} />;
  return <Intro meta={meta} onStart={(s) => { store.set(key, s.token); setSess(s); }} />;
}

function Intro({ meta, onStart }) {
  const [name, setName] = useState(() => store.get('qz_name', ''));
  const [info, setInfo] = useState(() => ({ phone: '', email: '', district: '', ...store.get('qz_info', {}) }));
  const setI = (p) => setInfo((o) => ({ ...o, ...p }));
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const start = async (e) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      store.set('qz_name', name.trim()); store.set('qz_info', info);
      onStart(await api(`/forms/p/${meta.code}/start`, { method: 'POST', body: { name, ...info, password, device: deviceId() } }));
    } catch (x) { if (x.status === 409 && x.code) setDone(x.code); setErr(x.message); } finally { setBusy(false); }
  };

  const closed = meta.state !== 'open';
  return (
    <div className="stack">
      <div className="card exam-head">
        <h1>{meta.title}</h1>
        {meta.description && <p className="pre">{meta.description}</p>}
        <div className="facts">
          <div><b>{bn(meta.questions)}</b><span>প্রশ্ন</span></div>
          <div><b>{num(meta.total_marks)}</b><span>পূর্ণমান</span></div>
          <div><b>{meta.duration_min ? bn(meta.duration_min) : '∞'}</b><span>{meta.duration_min ? 'মিনিট' : 'সময়সীমা নেই'}</span></div>
          <div><b className={meta.negative_mark ? 'tone-bad' : ''}>{meta.negative_mark ? `−${num(meta.negative_mark)}` : '০'}</b><span>প্রতি ভুলে</span></div>
        </div>
        <ul className="rules small">
          {meta.duration_min > 0 && <li>⏱ শুরু করলেই {bn(meta.duration_min)} মিনিটের টাইমার চালু হবে; সময় শেষ হলে উত্তর নিজে থেকেই জমা হয়ে যাবে।</li>}
          {meta.negative_mark > 0 && <li>➖ প্রতিটি ভুল উত্তরে {num(meta.negative_mark)} নম্বর কাটা যাবে। নিশ্চিত না হলে উত্তর না দেওয়াই ভালো।</li>}
          {meta.pass_mark != null && <li>✅ পাস মার্ক {num(meta.pass_mark)}।</li>}
          {meta.one_attempt && <li>🔁 পরীক্ষা একবারই দেওয়া যাবে।</li>}
          <li>💾 উত্তর নিজে থেকেই সেভ হয় — নেট চলে গেলে বা পেজ বন্ধ হলে একই লিংক খুললে যেখানে ছিলেন সেখান থেকে শুরু হবে।</li>
          {meta.ends_at && <li>📅 শেষ সময়: {fmtDate(meta.ends_at)}</li>}
        </ul>
      </div>

      {closed ? (
        <div className="card center empty">
          <div className="big-ico">{meta.state === 'upcoming' ? '⏳' : '🔒'}</div>
          <h3>{meta.state === 'upcoming' ? `পরীক্ষা শুরু হবে ${fmtDate(meta.starts_at)}` : 'পরীক্ষা শেষ হয়ে গেছে'}</h3>
          {meta.state === 'upcoming' && <button className="btn light" onClick={() => location.reload()}>↻ আবার দেখুন</button>}
        </div>
      ) : (
        <form className="card stack" onSubmit={start}>
          <label className="field"><span>আপনার নাম</span>
            <input className="input big" value={name} onChange={(e) => setName(e.target.value)} placeholder="পুরো নাম লিখুন" autoComplete="name" required minLength={2} maxLength={80} /></label>
          <label className="field"><span>📱 মোবাইল নম্বর</span>
            <input className="input" type="tel" inputMode="numeric" value={info.phone} onChange={(e) => setI({ phone: e.target.value })} placeholder="01XXXXXXXXX" autoComplete="tel" required maxLength={16} /></label>
          <label className="field"><span>✉️ ইমেইল (Gmail)</span>
            <input className="input" type="email" value={info.email} onChange={(e) => setI({ email: e.target.value })} placeholder="example@gmail.com" autoComplete="email" required maxLength={120} /></label>
          <label className="field"><span>📍 জেলা</span>
            <select className="input" value={info.district} onChange={(e) => setI({ district: e.target.value })} required>
              <option value="">— জেলা বেছে নিন —</option>
              {DISTRICTS.map((d) => <option key={d}>{d}</option>)}
            </select></label>
          {meta.needs_password && <label className="field"><span>🔒 পরীক্ষার পাসওয়ার্ড</span><input className="input" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>}
          {err && <div className="alert bad">{err}{done && <> — <button type="button" className="linkbtn" onClick={() => nav(`/e/${meta.code}/r/${done}`)}>আগের ফলাফল দেখুন</button></>}</div>}
          <button className="btn accent block big" disabled={busy}>{busy ? 'শুরু হচ্ছে…' : '▶ পরীক্ষা শুরু করুন'}</button>
        </form>
      )}
      {meta.show_leaderboard && <Link className="small center" to={`/e/${meta.code}/r/board`}>🏆 মেধাতালিকা দেখুন</Link>}
    </div>
  );
}

function Taking({ meta, sess, storeKey }) {
  const nav = useNavigate();
  const qs = sess.questions;
  const ansKey = `${storeKey}_a`;
  const [answers, setAnswers] = useState(() => ({ ...sess.answers, ...(store.get(ansKey) || {}) }));
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [saved, setSaved] = useState('saved');
  const offset = useRef(new Date(sess.server_now).getTime() - Date.now());
  const deadline = sess.deadline_at ? new Date(sess.deadline_at).getTime() : null;
  const left = () => (deadline ? Math.max(0, Math.round((deadline - (Date.now() + offset.current)) / 1000)) : null);
  const [remain, setRemain] = useState(left);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const submitting = useRef(false);

  const submit = useCallback(async (auto) => {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setErr(null);
    try {
      await api(`/forms/p/${meta.code}/submit`, { method: 'POST', body: { token: sess.token, answers: answersRef.current } });
      store.del(storeKey); store.del(ansKey);
      nav(`/e/${meta.code}/r/${sess.token}`, { replace: true, state: { auto } });
    } catch (e) { submitting.current = false; setBusy(false); setErr(`${e.message} — আবার "জমা দিন" চাপুন`); }
  }, [meta.code, sess.token, storeKey, ansKey, nav]);

  // Timer — auto-submits at zero.
  useEffect(() => {
    if (!deadline) return undefined;
    const t = setInterval(() => { const l = left(); setRemain(l); if (l <= 0) submit(true); }, 500);
    return () => clearInterval(t);
  }, [deadline, submit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave locally at once, to the server after a short pause.
  useEffect(() => {
    store.set(ansKey, answers);
    setSaved('saving');
    const t = setTimeout(() => api(`/forms/p/${meta.code}/save`, { method: 'PUT', body: { token: sess.token, answers } })
      .then(() => setSaved('saved')).catch(() => setSaved('offline')), 1200);
    return () => clearTimeout(t);
  }, [answers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Block copying question text while the exam is open (selection is also disabled in CSS).
  useEffect(() => {
    const block = (e) => { if (!e.target.closest?.('input, textarea')) e.preventDefault(); };
    const evs = ['copy', 'cut', 'contextmenu', 'selectstart', 'dragstart'];
    evs.forEach((ev) => document.addEventListener(ev, block));
    return () => evs.forEach((ev) => document.removeEventListener(ev, block));
  }, []);

  useEffect(() => {
    const warn = (e) => { if (!submitting.current) { e.preventDefault(); e.returnValue = ''; } };
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, []);

  const isAnswered = (q) => { const a = answers[q.id]; return Array.isArray(a) ? a.length > 0 : !!String(a ?? '').trim(); };
  const answered = qs.filter(isAnswered).length;
  const setA = (id, v) => setAnswers((o) => ({ ...o, [id]: v }));
  const low = remain != null && remain <= 60;

  return (
    <div className="stack taking">
      <div className={`exambar ${low ? 'low' : ''}`}>
        <div className="grow"><b className="clip">{meta.title}</b><div className="tiny">{sess.name} · {bn(answered)}/{bn(qs.length)} উত্তর · {saved === 'saving' ? 'সেভ হচ্ছে…' : saved === 'saved' ? '✓ সেভ হয়েছে' : '⚠ অফলাইন — ফোনে সেভ আছে'}</div></div>
        {remain != null && <div className="timer" aria-live="polite">⏱ {fmtTime(remain)}</div>}
      </div>
      <div className="progress"><span style={{ width: `${(answered / qs.length) * 100}%` }} /></div>
      {remain != null && remain <= 300 && remain > 0 && <div className={`alert ${low ? 'bad' : 'mid'}`}>{low ? '⚠️ ১ মিনিটেরও কম সময় বাকি!' : `⏳ আর ${bn(Math.ceil(remain / 60))} মিনিট বাকি`}</div>}

      {qs.map((q, i) => (
        <div key={q.id} id={`q${i}`} className={`card qcard ${isAnswered(q) ? 'done' : ''}`}>
          <div className="row tiny muted"><span>প্রশ্ন {bn(i + 1)}</span><span className="spacer" /><span>{num(q.marks)} নম্বর</span></div>
          <div className="q">{q.body}</div>
          {q.image && <img className="qimg" src={q.image} alt="" />}
          {q.type === 'text' ? (
            <input className="input big" placeholder="উত্তর লিখুন" value={answers[q.id] || ''} onChange={(e) => setA(q.id, e.target.value)} maxLength={300} />
          ) : (
            <>
              {q.type === 'multi' && <div className="tiny muted">একাধিক সঠিক উত্তর — সবগুলো বেছে নিন</div>}
              <div className="opts">{q.options.map((o, j) => {
                const cur = [].concat(answers[q.id] ?? []);
                const on = cur.includes(o.id);
                return (
                  <button type="button" key={o.id} className={`opt ${on ? 'sel' : ''} ${q.type}`} aria-pressed={on}
                    onClick={() => setA(q.id, q.type === 'single' ? (on ? [] : [o.id]) : on ? cur.filter((x) => x !== o.id) : [...cur, o.id])}>
                    <span className="b">{q.type === 'multi' && on ? '✓' : LETTERS[j]}</span>
                    <span className="grow">{o.text}{o.image && <img className="oimg" src={o.image} alt="" />}</span>
                  </button>
                );
              })}</div>
              {isAnswered(q) && q.type === 'single' && <button type="button" className="linkbtn tiny" onClick={() => setA(q.id, [])}>উত্তর মুছুন</button>}
            </>
          )}
        </div>
      ))}

      <div className="palette card">
        <div className="tiny muted">প্রশ্নে যান</div>
        <div className="dots">{qs.map((q, i) => <a key={q.id} href={`#q${i}`} className={isAnswered(q) ? 'on' : ''}>{bn(i + 1)}</a>)}</div>
      </div>
      {err && <div className="alert bad">{err}</div>}
      <button className="btn accent block big" disabled={busy} onClick={() => setConfirm(true)}>{busy ? 'জমা হচ্ছে…' : `✓ জমা দিন (${bn(answered)}/${bn(qs.length)})`}</button>

      <Modal open={confirm && !busy} onClose={() => setConfirm(false)} title="পরীক্ষা জমা দেবেন?">
        <div className="stack">
          <p>{bn(answered)}টি প্রশ্নের উত্তর দিয়েছেন{qs.length - answered ? <>, <b className="tone-bad">{bn(qs.length - answered)}টি বাকি</b></> : ''}। জমা দেওয়ার পর আর বদলানো যাবে না।</p>
          <div className="row"><button className="btn accent" onClick={() => { setConfirm(false); submit(false); }}>হ্যাঁ, জমা দিন</button><button className="btn light" onClick={() => setConfirm(false)}>আরেকটু দেখি</button></div>
        </div>
      </Modal>
    </div>
  );
}
