import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useFetch, Loader, ErrorBox, Empty, Bar } from '../components/ui.jsx';
import { bn, fmtDate, fmtDuration } from '../utils.js';

const countWords = (t) => (t.trim().match(/\S+/g) || []).length;

export default function Written() {
  const [tab, setTab] = useState('prompts');
  const { data, loading } = useFetch('/prep/written/prompts');
  const { data: mine } = useFetch(tab === 'mine' ? '/prep/written/mine' : null, [tab]);
  return (
    <div className="stack">
      <div className="page-head"><div><h1>✍️ লিখিত প্রস্তুতি</h1><p>লিখুন → স্বয়ংক্রিয় মূল্যায়ন → সহপাঠীর রিভিউ → বিশেষজ্ঞের চূড়ান্ত নম্বর।</p></div></div>
      <div className="alert small">
        {data?.ai ? 'এআই আপনার উত্তর রুব্রিক ধরে মূল্যায়ন করবে।' : 'স্বয়ংক্রিয় প্রাথমিক বিশ্লেষণ: দৈর্ঘ্য, কাঠামো, মূল পয়েন্ট ও তথ্য-উপাত্ত।'} যুক্তির গভীরতা ও ভাষার মান চূড়ান্তভাবে বিচার করেন মানুষ — তাই বিশেষজ্ঞ রিভিউয়ের নম্বরই চূড়ান্ত।
      </div>
      <div className="tabs">{[['prompts', 'প্রশ্ন'], ['mine', 'আমার উত্তর'], ['peer', 'পিয়ার রিভিউ করুন']].map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'prompts' && (loading ? <Loader /> : !data.prompts.length ? <div className="card"><Empty title="আপনার ট্র্যাকের জন্য এখনো লিখিত প্রশ্ন নেই" /></div> : (
        <div className="grid g2">{data.prompts.map((p) => (
          <div key={p.id} className="card">
            <div className="row between"><span className="badge">{p.subject || p.exam}</span><span className="tiny muted">{bn(p.marks)} নম্বর · {bn(p.word_limit)} শব্দ · {bn(p.time_min)} মিনিট</span></div>
            <h3 className="mt" style={{ marginTop: '.5rem' }}>{p.title}</h3>
            {p.source && <div className="tiny muted">{p.source}</div>}
            <div className="row between mt">
              <span className="small muted">{p.my_attempts ? `${bn(p.my_attempts)} বার লিখেছেন · সেরা ${bn(Number(p.my_best))}` : 'এখনো লেখেননি'}</span>
              <Link className="btn sm" to={`/app/written/${p.id}`}>লিখুন</Link>
            </div>
          </div>
        ))}</div>
      ))}
      {tab === 'mine' && (!mine ? <Loader /> : !mine.length ? <div className="card"><Empty title="এখনো কোনো উত্তর জমা দেননি" /></div> : (
        <div className="card table-wrap"><table className="table">
          <thead><tr><th>প্রশ্ন</th><th>শব্দ</th><th>স্বয়ংক্রিয়</th><th>পিয়ার</th><th>বিশেষজ্ঞ</th><th>তারিখ</th></tr></thead>
          <tbody>{mine.map((w) => (
            <tr key={w.id}>
              <td><Link to={`/app/written/submission/${w.id}`}>{w.title}</Link></td><td>{bn(w.word_count)}</td>
              <td>{w.auto_score != null ? `${bn(Number(w.auto_score))}/${bn(w.marks)}` : '—'}</td><td>{bn(w.peer_count)}</td>
              <td>{w.expert_score != null ? <b>{bn(Number(w.expert_score))}/{bn(w.marks)}</b> : w.expert_requested ? <span className="badge mid">অপেক্ষমাণ</span> : '—'}</td>
              <td className="small">{fmtDate(w.created_at)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      ))}
      {tab === 'peer' && <PeerReview />}
    </div>
  );
}

export function WrittenEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: p, error, loading } = useFetch(`/prep/written/prompts/${id}`);
  const [text, setText] = useState('');
  const [allowPeer, setAllowPeer] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const started = useRef(Date.now());
  const key = `arohon_written_${id}`;

  useEffect(() => { try { setText(localStorage.getItem(key) || ''); } catch { /* ignore */ } }, [key]);
  useEffect(() => { try { localStorage.setItem(key, text); } catch { /* ignore */ } }, [key, text]);
  useEffect(() => { const t = setInterval(() => setElapsed(Math.round((Date.now() - started.current) / 1000)), 1000); return () => clearInterval(t); }, []);

  if (loading) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  const words = countWords(text);
  const remaining = p.time_min * 60 - elapsed;
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const d = await api.post(`/prep/written/prompts/${id}/submit`, { answer: text, time_spent_sec: elapsed, allow_peer: allowPeer });
      localStorage.removeItem(key);
      nav(`/app/written/submission/${d.id}`);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>{p.title}</h1><p>{bn(p.marks)} নম্বর · প্রায় {bn(p.word_limit)} শব্দ · {bn(p.time_min)} মিনিট</p></div>
        <div className={`badge ${remaining < 0 ? 'bad' : remaining < 120 ? 'mid' : 'gray'}`} style={{ fontSize: '1rem', padding: '.4rem .8rem' }}>⏱ {remaining >= 0 ? fmtDuration(remaining) : `+${fmtDuration(-remaining)} বেশি`}</div>
      </div>
      <div className="card"><div className="qbody">{p.prompt}</div>
        <div className="tiny muted mt">মূল্যায়নের মানদণ্ড: {p.rubric.map((c) => `${c.label} (${bn(Math.round(c.weight * 100))}%)`).join(' · ')}</div>
      </div>
      <ErrorBox error={err} />
      <div className="card">
        <label htmlFor="ans" className="small muted">আপনার উত্তর — উপ-শিরোনাম ও অনুচ্ছেদ ব্যবহার করুন (খালি লাইন দিয়ে আলাদা করুন)। লেখা স্বয়ংক্রিয়ভাবে সংরক্ষিত হচ্ছে।</label>
        <textarea id="ans" className="input" style={{ minHeight: 380, fontSize: '1.02rem', lineHeight: 1.7, marginTop: '.4rem' }} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="row between mt">
          <span className={`small ${words > p.word_limit * 1.3 ? 'tone-bad' : words >= p.word_limit * 0.8 ? 'tone-good' : 'muted'}`}>{bn(words)} / {bn(p.word_limit)} শব্দ</span>
          <label className="small row" style={{ gap: '.3rem' }}><input type="checkbox" checked={allowPeer} onChange={(e) => setAllowPeer(e.target.checked)} /> পরিচয় গোপন রেখে সহপাঠীরা রিভিউ করতে পারবে</label>
          <button className="btn accent" onClick={submit} disabled={busy || words < 20}>{busy ? 'মূল্যায়ন হচ্ছে…' : 'জমা দিন ও মূল্যায়ন দেখুন'}</button>
        </div>
      </div>
    </div>
  );
}

export function WrittenSubmission() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data: w, error, loading, reload } = useFetch(`/prep/written/submissions/${id}`);
  const [err, setErr] = useState(null);
  if (loading && !w) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  const fb = w.auto_feedback;
  const own = w.user_id === user.id;
  const requestExpert = async () => { setErr(null); try { await api.post(`/prep/written/submissions/${id}/request-expert`); reload(); } catch (e) { setErr(e); } };
  const helpful = async (pr, v) => { await api.post(`/prep/written/peer-reviews/${pr.id}/helpful`, { helpful: v }); reload(); };
  const peerAvg = w.peer_reviews.length ? w.peer_reviews.reduce((s, x) => s + Number(x.total), 0) / w.peer_reviews.length : null;

  return (
    <div className="stack">
      <div className="page-head"><div><h1>{w.prompt.title}</h1><p>{fmtDate(w.created_at, true)} · {bn(w.word_count)} শব্দ · সময় {fmtDuration(w.time_spent_sec)}</p></div><Link to="/app/written" className="btn light">সব প্রশ্ন</Link></div>
      <ErrorBox error={err} />
      <div className="grid g3">
        <div className="card stat"><span className="v">{fb?.provisional_marks != null ? `${bn(fb.provisional_marks)}/${bn(w.prompt.marks)}` : '—'}</span><span className="l">{fb?.engine === 'ai' ? 'এআই নির্দেশক নম্বর' : 'স্বয়ংক্রিয় প্রাথমিক নম্বর'}</span></div>
        <div className="card stat"><span className="v">{peerAvg != null ? `${bn(Math.round(peerAvg * 2) / 2)}/${bn(w.prompt.marks)}` : '—'}</span><span className="l">সহপাঠীদের গড় ({bn(w.peer_reviews.length)} জন)</span></div>
        <div className="card stat"><span className="v">{w.expert_score != null ? `${bn(Number(w.expert_score))}/${bn(w.prompt.marks)}` : '—'}</span><span className="l">বিশেষজ্ঞের চূড়ান্ত নম্বর</span>
          {own && w.expert_score == null && (w.expert_requested ? <span className="badge mid">রিভিউয়ের অপেক্ষায়</span> : <button className="btn accent sm" onClick={requestExpert}>বিশেষজ্ঞ রিভিউ চান</button>)}
        </div>
      </div>

      {w.expert_feedback && <div className="card" style={{ borderColor: 'var(--good)', borderWidth: 2 }}><h3>🎓 বিশেষজ্ঞের মতামত {w.expert_name && <span className="small muted">— {w.expert_name}</span>}</h3><p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{w.expert_feedback}</p></div>}

      {fb && (
        <div className="card">
          <h3>{fb.engine === 'ai' ? '🤖 এআই মূল্যায়ন' : '🔍 স্বয়ংক্রিয় বিশ্লেষণ'}</h3>
          <p className="tiny muted">{fb.note}</p>
          {fb.overall && <div className="insight info small">{fb.overall}</div>}
          {fb.criteria.map((c) => (
            <div key={c.key} style={{ padding: '.45rem 0', borderBottom: '1px dashed var(--line)' }}>
              <div className="row between small"><b>{c.label}</b><span>{c.score_pct == null ? <span className="muted">মানুষের বিচার প্রয়োজন</span> : `${bn(c.score_pct)}%`}</span></div>
              {c.score_pct != null && <Bar value={c.score_pct} />}
              <div className="small muted" style={{ marginTop: '.25rem' }}>{c.comment}</div>
            </div>
          ))}
          <div className="grid g2 mt">
            <div>{fb.strengths?.length > 0 && <><b className="small tone-good">✓ ভালো দিক</b><ul className="small">{fb.strengths.map((s) => <li key={s}>{s}</li>)}</ul></>}</div>
            <div>{fb.improvements?.length > 0 && <><b className="small tone-bad">↑ যা উন্নত করবেন</b><ul className="small">{fb.improvements.map((s) => <li key={s}>{s}</li>)}</ul></>}</div>
          </div>
          {fb.missing_points?.length > 0 && <div className="insight warn small"><span>📌</span><span>যে পয়েন্টগুলো আসেনি: {fb.missing_points.join('; ')}</span></div>}
        </div>
      )}

      <div className="grid g2">
        <div className="card"><h3>আপনার উত্তর</h3><div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{w.answer}</div></div>
        <div className="card"><h3>📘 আদর্শ উত্তরের কাঠামো</h3>
          <p className="small muted">{w.prompt.prompt}</p>
          {w.prompt.model_answer ? <div className="explain" style={{ whiteSpace: 'pre-wrap' }}>{w.prompt.model_answer}</div> : <p className="small muted">—</p>}
          {w.prompt.key_points?.length > 0 && <><b className="small">মূল পয়েন্টসমূহ</b><ul className="small">{w.prompt.key_points.map((k) => <li key={k.point}>{k.point}</li>)}</ul></>}
        </div>
      </div>

      <div className="card">
        <h3>👥 সহপাঠীদের রিভিউ</h3>
        {!w.peer_reviews.length ? <p className="small muted">এখনো কেউ রিভিউ করেনি। সাধারণত ২৪ ঘণ্টার মধ্যে রিভিউ আসে।</p> : w.peer_reviews.map((pr) => (
          <div key={pr.id} className="insight">
            <div style={{ flex: 1 }}>
              <div className="small"><b>{bn(Number(pr.total))}/{bn(w.prompt.marks)}</b> · <span className="muted">{w.prompt.rubric.map((c) => `${c.label.split(' ')[0]} ${bn(pr.scores[c.key] ?? '—')}%`).join(' · ')}</span></div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{pr.comment}</div>
              {own && <div className="row tiny mt"><span className="muted">রিভিউটি কাজে লেগেছে?</span>
                <button className={`chip ${pr.helpful === 1 ? 'active' : ''}`} onClick={() => helpful(pr, 1)}>হ্যাঁ</button>
                <button className={`chip ${pr.helpful === 0 ? 'active' : ''}`} onClick={() => helpful(pr, 0)}>না</button></div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PeerReview() {
  const { data: w, loading, reload } = useFetch('/prep/written/peer/next');
  const [scores, setScores] = useState({});
  const [comment, setComment] = useState('');
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(0);
  if (loading) return <Loader />;
  if (!w) return <div className="card"><Empty icon="🎉" title="এই মুহূর্তে রিভিউ করার মতো উত্তর নেই">পরে আবার দেখুন।</Empty></div>;
  const submit = async () => {
    setErr(null);
    const full = Object.fromEntries(w.rubric.map((c) => [c.key, scores[c.key] ?? 50]));
    try { await api.post(`/prep/written/peer/${w.id}`, { scores: full, comment }); setScores({}); setComment(''); setDone(done + 1); reload(); } catch (e) { setErr(e.message); }
  };
  return (
    <div className="grid g2">
      <div className="card">
        <div className="row between"><span className="badge">{w.title}</span><span className="tiny muted">{bn(w.word_count)} শব্দ · সীমা {bn(w.word_limit)}</span></div>
        <p className="small muted mt">{w.prompt}</p>
        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{w.answer}</div>
      </div>
      <div className="card">
        <h3>আপনার রিভিউ (+১০ XP)</h3>
        {done > 0 && <div className="alert good small">ধন্যবাদ! {bn(done)}টি রিভিউ দিয়েছেন। অন্যের উত্তর মূল্যায়ন করাও নিজের লেখা উন্নত করার ভালো উপায়।</div>}
        <ErrorBox error={err} />
        {w.rubric.map((c) => (
          <div key={c.key} className="field">
            <label htmlFor={`pr-${c.key}`}>{c.label}: <b>{bn(scores[c.key] ?? 50)}%</b></label>
            <input id={`pr-${c.key}`} type="range" min="0" max="100" step="5" value={scores[c.key] ?? 50} onChange={(e) => setScores({ ...scores, [c.key]: Number(e.target.value) })} />
          </div>
        ))}
        <div className="field"><label htmlFor="pr-c">গঠনমূলক মন্তব্য — কী ভালো হয়েছে, কী যোগ করা যেত</label><textarea id="pr-c" className="input" value={comment} onChange={(e) => setComment(e.target.value)} /></div>
        <div className="row"><button className="btn" onClick={submit} disabled={comment.trim().length < 20}>রিভিউ জমা দিন</button><button className="btn light" onClick={reload}>এড়িয়ে যান</button></div>
        <p className="tiny muted mt">ভদ্র ও সুনির্দিষ্ট থাকুন। ব্যক্তিগত আক্রমণ বা অপ্রাসঙ্গিক মন্তব্য রিপোর্ট হলে সরিয়ে দেওয়া হয়।</p>
      </div>
    </div>
  );
}
