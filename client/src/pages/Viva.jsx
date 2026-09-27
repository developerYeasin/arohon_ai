import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useFetch, Loader, ErrorBox, Empty, Bar, Ring } from '../components/ui.jsx';
import { bn, fmtDate, fmtDuration } from '../utils.js';

const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = /[a-zA-Z]{4,}/.test(text) && !/[ঀ-৿]/.test(text) ? 'en-US' : 'bn-BD';
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

export default function Viva() {
  const nav = useNavigate();
  const { data: sessions, loading } = useFetch('/prep/viva/sessions');
  const [count, setCount] = useState(8);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true); setErr(null);
    try { const d = await api.post('/prep/viva/sessions', { count }); nav(`/app/viva/${d.id}`); } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <div className="stack">
      <div className="page-head"><div><h1>🎙️ মক ভাইভা</h1><p>বোর্ডের মতো প্রশ্ন, আপনার উত্তরের ভিত্তিতে পাল্টা প্রশ্ন, আর প্রতিটি উত্তরের পর মতামত।</p></div></div>
      <ErrorBox error={err} />
      <div className="card hero-card">
        <h3>নতুন ভাইভা সেশন</h3>
        <p className="muted small">প্রশ্ন শুনুন (🔊), মাইক চেপে বাংলায় বলুন — কথা লেখায় রূপান্তর হবে — অথবা টাইপ করুন। শুরুতে পরিচিতি, তারপর মুক্তিযুদ্ধ, সংবিধান, সাম্প্রতিক ও পরিস্থিতিভিত্তিক প্রশ্ন।</p>
        <div className="row">
          <label className="small">প্রশ্নসংখ্যা <select className="input" style={{ width: 'auto', display: 'inline-block' }} value={count} onChange={(e) => setCount(Number(e.target.value))}>{[5, 8, 10, 12].map((n) => <option key={n} value={n}>{bn(n)}</option>)}</select></label>
          <button className="btn accent" onClick={start} disabled={busy}>{busy ? 'প্রস্তুত হচ্ছে…' : 'বোর্ডে প্রবেশ করুন'}</button>
        </div>
        <p className="tiny muted mt" style={{ marginBottom: 0 }}>{SR ? 'আপনার ব্রাউজারে ভয়েস ইনপুট সমর্থিত।' : 'এই ব্রাউজারে ভয়েস ইনপুট নেই — Chrome ব্যবহার করুন, অথবা টাইপ করে উত্তর দিন।'} আমরা শুধু লেখা বিশ্লেষণ করি — কণ্ঠস্বর বা অঙ্গভঙ্গি বিচার করা হয় না।</p>
      </div>
      <div className="card">
        <h3>আগের সেশন</h3>
        {loading ? <Loader /> : !sessions.length ? <p className="small muted">এখনো কোনো সেশন নেই।</p> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>তারিখ</th><th>প্রশ্ন</th><th>সামগ্রিক</th><th>বিষয়বস্তু</th><th>স্পষ্টতা</th><th>আত্মবিশ্বাস</th><th /></tr></thead>
            <tbody>{sessions.map((s) => (
              <tr key={s.id}>
                <td className="small">{fmtDate(s.created_at, true)}</td><td>{bn(s.questions)}</td>
                <td>{s.summary ? <b>{bn(s.summary.overall)}%</b> : <span className="badge mid">চলমান</span>}</td>
                <td>{s.summary ? `${bn(s.summary.scores.content)}%` : '—'}</td><td>{s.summary ? `${bn(s.summary.scores.clarity)}%` : '—'}</td><td>{s.summary ? `${bn(s.summary.scores.confidence)}%` : '—'}</td>
                <td><Link className="btn light sm" to={`/app/viva/${s.id}`}>{s.status === 'completed' ? 'রিপোর্ট' : 'চালিয়ে যান'}</Link></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

export function VivaSession() {
  const { id } = useParams();
  const { data, error, loading, reload } = useFetch(`/prep/viva/sessions/${id}`);
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [usedVoice, setUsedVoice] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [secs, setSecs] = useState(0);
  const rec = useRef(null);
  const startedAt = useRef(Date.now());
  const qText = data?.current?.text;

  useEffect(() => {
    if (!qText || feedback) return;
    startedAt.current = Date.now(); setSecs(0); speak(qText);
    const t = setInterval(() => setSecs(Math.round((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [qText, feedback]);
  useEffect(() => () => { rec.current?.stop(); window.speechSynthesis?.cancel(); }, []);

  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox error={error} />;

  const toggleMic = () => {
    if (listening) { rec.current?.stop(); return; }
    const r = new SR();
    r.lang = 'bn-BD'; r.continuous = true; r.interimResults = false;
    r.onresult = (e) => {
      const said = Array.from(e.results).slice(e.resultIndex).filter((x) => x.isFinal).map((x) => x[0].transcript).join(' ');
      if (said) setText((t) => `${t} ${said}`.trim());
    };
    r.onend = () => setListening(false);
    r.onerror = (e) => { setListening(false); if (e.error !== 'no-speech') setErr('মাইক্রোফোন চালু করা যায়নি — ব্রাউজারে অনুমতি দিন, অথবা টাইপ করুন।'); };
    window.speechSynthesis?.cancel();
    r.start(); rec.current = r; setListening(true); setUsedVoice(true);
  };

  const send = async (skip = false) => {
    rec.current?.stop();
    setBusy(true); setErr(null);
    try {
      const d = await api.post(`/prep/viva/sessions/${id}/answer`, { answer: text, skip, duration_sec: Math.round((Date.now() - startedAt.current) / 1000), input_mode: usedVoice ? 'voice' : 'text' });
      setText(''); setUsedVoice(false);
      if (d.feedback) setFeedback(d.feedback); else { setFeedback(null); reload(); }
      if (d.done && !d.feedback) reload();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const next = () => { setFeedback(null); reload(); };

  if (data.status === 'completed' && !feedback) return <VivaReport data={data} />;
  const answeredMain = data.answers.filter((a) => !a.is_follow_up).length;

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>🎙️ ভাইভা বোর্ড</h1><p>প্রশ্ন {bn(Math.min(answeredMain + (data.current?.is_follow_up ? 0 : 1), data.total))}/{bn(data.total)}{data.current?.category ? ` · ${data.categories[data.current.category]}` : ''}</p></div>
        <Link to="/app/viva" className="btn light sm">বিরতি নিন</Link>
      </div>
      <Bar value={(answeredMain / data.total) * 100} tone="good" />
      <ErrorBox error={err} />

      {feedback ? (
        <div className="card">
          <h3>মতামত {feedback.engine === 'ai' ? <span className="badge">এআই</span> : <span className="badge gray">স্বয়ংক্রিয়</span>}</h3>
          <div className="grid g3">
            {[['content', 'বিষয়বস্তু'], ['clarity', 'স্পষ্টতা'], ['confidence', 'আত্মবিশ্বাস']].map(([k, l]) => (
              <div key={k} className="dim"><div className="v">{bn(feedback.scores[k])}%</div><div className="l">{l}</div><Bar value={feedback.scores[k]} /></div>
            ))}
          </div>
          <p className="small mt">{feedback.comment}</p>
          <div className="tiny muted">{bn(feedback.words)} শব্দ{feedback.wpm ? ` · প্রতি মিনিটে ${bn(feedback.wpm)} শব্দ` : ''}{feedback.fillers ? ` · "মানে/আসলে" ${bn(feedback.fillers)} বার` : ''}</div>
          {feedback.tips?.length > 0 && <ul className="small">{feedback.tips.map((t) => <li key={t}>{t}</li>)}</ul>}
          {feedback.better_outline?.length > 0 && <div className="explain small"><b>ভালো উত্তরে যা থাকে:</b><ul style={{ margin: '.3rem 0 0' }}>{feedback.better_outline.map((t) => <li key={t}>{t}</li>)}</ul></div>}
          <button className="btn mt" onClick={next}>{data.current ? 'পরের প্রশ্ন →' : 'রিপোর্ট দেখুন'}</button>
        </div>
      ) : data.current && (
        <div className="card hero-card">
          <div className="row between">
            <span className="badge accent">{data.current.is_follow_up ? '↪ পাল্টা প্রশ্ন' : data.categories[data.current.category]}</span>
            <span className="small">⏱ {fmtDuration(secs)}</span>
          </div>
          <h2 className="mt" style={{ lineHeight: 1.5 }}>{data.current.text}</h2>
          <button className="btn light sm" onClick={() => speak(data.current.text)}>🔊 আবার শুনুন</button>
          <textarea className="input mt" style={{ minHeight: 150, color: 'var(--text)' }} placeholder={SR ? 'মাইক চেপে বলুন, অথবা এখানে লিখুন…' : 'এখানে উত্তর লিখুন…'} value={text} onChange={(e) => setText(e.target.value)} aria-label="আপনার উত্তর" />
          <div className="row mt">
            {SR && <button className={`btn ${listening ? 'danger' : 'accent'}`} onClick={toggleMic}>{listening ? '⏹ থামান' : '🎤 বলুন'}</button>}
            <button className="btn" onClick={() => send(false)} disabled={busy || text.trim().split(/\s+/).length < 3}>{busy ? 'মূল্যায়ন…' : 'উত্তর দিন'}</button>
            <button className="btn light" onClick={() => send(true)} disabled={busy}>জানি না — পরের প্রশ্ন</button>
          </div>
          <p className="tiny muted mt" style={{ marginBottom: 0 }}>পরামর্শ: ১-২ মিনিটে উত্তর দিন। না জানলে বিনয়ের সঙ্গে স্বীকার করাই ভালো।</p>
        </div>
      )}
    </div>
  );
}

function VivaReport({ data }) {
  const s = data.summary;
  if (!s) return <Empty title="কোনো উত্তর দেওয়া হয়নি" />;
  return (
    <div className="stack">
      <div className="page-head"><div><h1>🎙️ ভাইভা রিপোর্ট</h1><p>{bn(data.answers.length)}টি উত্তর</p></div><Link to="/app/viva" className="btn">নতুন সেশন</Link></div>
      <div className="grid g-main">
        <div className="card">
          <div className="row" style={{ gap: '1.5rem' }}>
            <Ring value={s.overall} sub="সামগ্রিক" />
            <div className="grid g3" style={{ flex: 1 }}>
              {[['content', 'বিষয়বস্তু'], ['clarity', 'স্পষ্টতা'], ['confidence', 'আত্মবিশ্বাস']].map(([k, l]) => <div key={k} className="dim"><div className="v">{bn(s.scores[k])}%</div><div className="l">{l}</div></div>)}
            </div>
          </div>
          {s.weakest && <p className="small mt">দুর্বলতম বিভাগ: <b>{s.weakest.label}</b> ({bn(s.weakest.score)}%) · শক্তিশালী: <b>{s.strongest?.label}</b></p>}
        </div>
        <div className="card"><h3>পরবর্তী প্রস্তুতি</h3>{s.tips.length ? <ul className="small">{s.tips.map((t) => <li key={t}>{t}</li>)}</ul> : <p className="small muted">চমৎকার! এভাবেই অনুশীলন চালিয়ে যান।</p>}</div>
      </div>
      <div className="card">
        <h3>প্রশ্নভিত্তিক পর্যালোচনা</h3>
        {data.answers.map((a) => (
          <div key={a.id} style={{ padding: '.7rem 0', borderBottom: '1px dashed var(--line)' }}>
            <div className="small muted">{a.is_follow_up ? '↪ পাল্টা প্রশ্ন' : data.categories[a.category]} · {fmtDuration(a.duration_sec)} · {a.input_mode === 'voice' ? '🎤' : '⌨️'}</div>
            <b>{a.question_text}</b>
            <div className="small" style={{ whiteSpace: 'pre-wrap', margin: '.3rem 0' }}>{a.answer}</div>
            {a.feedback && <div className="tiny muted">বিষয়বস্তু {bn(a.feedback.scores.content)}% · স্পষ্টতা {bn(a.feedback.scores.clarity)}% · আত্মবিশ্বাস {bn(a.feedback.scores.confidence)}%</div>}
            {a.guidance && <div className="explain small">💡 {a.guidance}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
