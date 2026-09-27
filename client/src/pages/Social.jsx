import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useFetch, Loader, ErrorBox, Empty, Bar, Modal } from '../components/ui.jsx';
import { bn, fmtDate, fmtDuration } from '../utils.js';

const BN_LETTER = { a: 'ক', b: 'খ', c: 'গ', d: 'ঘ' };

async function copy(text) { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } }

// ================= Battles =================
export function Battles() {
  const nav = useNavigate();
  const { data } = useFetch('/social/battles');
  const [code, setCode] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);
  const go = async (key, fn) => { setBusy(key); setErr(null); try { const d = await fn(); nav(`/app/battle/${d.id}`); } catch (e) { setErr(e.message); } finally { setBusy(null); } };
  return (
    <div className="stack">
      <div className="page-head"><div><h1>⚔️ ১-বনাম-১ ব্যাটল</h1><p>একই ১০টি প্রশ্ন, একই সময়সীমা। বেশি সঠিক উত্তর জেতে; সমান হলে যে দ্রুত।</p></div>
        {data && <span className="badge good">জয় {bn(data.record.won)} / {bn(data.record.played)}</span>}</div>
      <ErrorBox error={err} />
      <div className="grid g3">
        <div className="card"><h3>🎲 দ্রুত ম্যাচ</h3><p className="small muted">আপনার ট্র্যাকের যেকোনো অনলাইন প্রতিযোগীর সাথে।</p>
          <button className="btn accent" disabled={!!busy} onClick={() => go('q', () => api.post('/social/battles/quick'))}>{busy === 'q' ? 'খোঁজা হচ্ছে…' : 'প্রতিপক্ষ খুঁজুন'}</button></div>
        <div className="card"><h3>👥 বন্ধুকে আমন্ত্রণ</h3><p className="small muted">কোড তৈরি করে বন্ধুকে পাঠান।</p>
          <button className="btn" disabled={!!busy} onClick={() => go('c', () => api.post('/social/battles', {}))}>{busy === 'c' ? '…' : 'ব্যাটল তৈরি করুন'}</button></div>
        <div className="card"><h3>🔑 কোড দিয়ে যোগ দিন</h3>
          <div className="row"><input className="input" style={{ maxWidth: 160, textTransform: 'uppercase' }} placeholder="যেমন: DY465Q" value={code} onChange={(e) => setCode(e.target.value)} aria-label="ব্যাটল কোড" />
            <button className="btn ghost" disabled={!code || !!busy} onClick={() => go('j', () => api.post(`/social/battles/join/${code.trim()}`))}>যোগ দিন</button></div></div>
      </div>
      <div className="card table-wrap">
        <h3>সাম্প্রতিক ব্যাটল</h3>
        {!data?.rows.length ? <p className="small muted">এখনো কোনো ব্যাটল নেই।</p> : (
          <table className="table"><thead><tr><th>প্রতিপক্ষ</th><th>ফল</th><th>অবস্থা</th><th>তারিখ</th><th /></tr></thead>
            <tbody>{data.rows.map((b) => {
              const my = Number(b.my_correct || 0), th = Number(b.their_correct || 0);
              return (
                <tr key={b.id}>
                  <td>{[b.creator, b.opponent].filter(Boolean).join(' বনাম ')}</td>
                  <td>{b.status === 'finished' ? <span className={`badge ${my > th ? 'good' : my < th ? 'bad' : 'gray'}`}>{bn(my)} - {bn(th)}</span> : '—'}</td>
                  <td className="small">{{ waiting: 'অপেক্ষমাণ', active: 'চলমান', finished: 'শেষ', expired: 'মেয়াদোত্তীর্ণ' }[b.status]}</td>
                  <td className="small">{fmtDate(b.created_at, true)}</td>
                  <td><Link className="btn light sm" to={`/app/battle/${b.id}`}>দেখুন</Link></td>
                </tr>
              );
            })}</tbody></table>
        )}
      </div>
    </div>
  );
}

export function BattleRoom() {
  const { id } = useParams();
  const [b, setB] = useState(null);
  const [err, setErr] = useState(null);
  const [idx, setIdx] = useState(0);
  const [left, setLeft] = useState(null);
  const [copied, setCopied] = useState(false);
  const qStart = useRef(Date.now());
  const sending = useRef(false);

  const load = () => api.get(`/social/battles/${id}`).then(setB).catch((e) => setErr(e.message));
  useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) load(); }, 1500); return () => clearInterval(t); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Jump to the first question I haven't answered yet.
  useEffect(() => {
    if (!b || b.status !== 'active') return;
    const next = b.questions.findIndex((q) => !b.my_answers[q.id]);
    if (next !== -1 && next !== idx) { setIdx(next); qStart.current = Date.now(); }
  }, [b]); // eslint-disable-line react-hooks/exhaustive-deps

  const answer = async (sel) => {
    if (!b || sending.current) return;
    const q = b.questions[idx];
    if (!q || b.my_answers[q.id]) return;
    sending.current = true;
    try {
      await api.post(`/social/battles/${id}/answer`, { question_id: q.id, selected: sel, time_ms: Date.now() - qStart.current });
      setB((x) => ({ ...x, my_answers: { ...x.my_answers, [q.id]: { selected: sel } } }));
      setIdx((i) => i + 1); qStart.current = Date.now();
      load();
    } catch (e) { setErr(e.message); } finally { sending.current = false; }
  };

  // Per-question countdown; unanswered on timeout.
  useEffect(() => {
    if (!b || b.status !== 'active') return;
    const t = setInterval(() => {
      const l = b.per_question_sec - Math.floor((Date.now() - qStart.current) / 1000);
      setLeft(l);
      if (l <= 0) answer(null);
    }, 250);
    return () => clearInterval(t);
  }, [b?.status, idx]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err && !b) return <ErrorBox error={err} />;
  if (!b) return <Loader />;
  const me = b.players.find((p) => p.id === b.me);
  const opp = b.players.find((p) => p.id !== b.me);
  const total = b.questions.length || 10;

  if (b.status === 'waiting') {
    const link = `${window.location.origin}/app/battle/join/${b.code}`;
    return (
      <div className="card center" style={{ maxWidth: 560, margin: '2rem auto' }}>
        <h2>⏳ প্রতিপক্ষের অপেক্ষায়…</h2>
        <p className="muted">{b.is_open ? 'আপনার ট্র্যাকের কেউ যোগ দিলেই শুরু হবে।' : 'এই কোড বা লিংক বন্ধুকে পাঠান:'}</p>
        <div style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '.2em' }}>{b.code}</div>
        <button className="btn mt" onClick={async () => setCopied(await copy(`আরোহণে আমার সাথে ১-বনাম-১ ব্যাটল খেলো! কোড: ${b.code} — ${link}`))}>{copied ? '✓ কপি হয়েছে' : 'আমন্ত্রণ কপি করুন'}</button>
        <div className="spinner" style={{ margin: '1.5rem auto 0' }} />
      </div>
    );
  }

  const scoreboard = (
    <div className="grid g2">
      {[me, opp].map((p, k) => p && (
        <div key={p.id} className="card" style={k === 0 ? { borderColor: 'var(--brand)', borderWidth: 2 } : null}>
          <div className="row between"><b>{k === 0 ? 'আপনি' : p.name}</b>{b.status === 'finished' && b.winner === p.id && <span className="badge good">🏆 বিজয়ী</span>}</div>
          <div className="small muted">{bn(p.answered)}/{bn(total)} উত্তর{b.status === 'finished' ? ` · সঠিক ${bn(p.correct)} · ${fmtDuration(Math.round(p.time_ms / 1000))}` : ''}</div>
          <Bar value={(p.answered / total) * 100} tone={k === 0 ? 'good' : 'mid'} />
        </div>
      ))}
    </div>
  );

  if (b.status === 'finished') {
    return (
      <div className="stack">
        <div className="page-head"><div><h1>{b.winner === b.me ? '🏆 আপনি জিতেছেন!' : b.winner === 0 ? '🤝 ড্র' : 'এবার হলো না — আবার চেষ্টা করুন'}</h1><p>ফলাফল আপনার অ্যানালিটিক্স ও রিভিশনে যোগ হয়েছে।</p></div><Link className="btn" to="/app/battles">নতুন ব্যাটল</Link></div>
        {scoreboard}
        <div className="card">
          <h3>প্রশ্ন পর্যালোচনা</h3>
          {b.questions.map((q, i) => {
            const my = b.my_answers[q.id];
            return (
              <div key={q.id} className="qcard">
                <div className="qhead"><span className="qnum">{bn(i + 1)}</span><div className="qbody">{q.body}</div></div>
                <div className="opts">{['a', 'b', 'c', 'd'].map((l) => <div key={l} className={`opt ${q.correct === l ? 'correct' : my?.selected === l ? 'wrong' : ''}`}><span className="bubble">{BN_LETTER[l]}</span>{q.options[l]}</div>)}</div>
                {q.explanation && <div className="explain">{q.explanation}</div>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const q = b.questions[idx];
  return (
    <div className="stack">
      {scoreboard}
      <ErrorBox error={err} />
      {q ? (
        <div className="qcard current">
          <div className="row between mb"><span className="badge">{bn(idx + 1)}/{bn(total)} · {q.subject}</span><span className={`badge ${left <= 5 ? 'bad' : 'gray'}`} style={{ fontSize: '1rem' }}>⏱ {bn(Math.max(0, left ?? b.per_question_sec))}</span></div>
          <div className="qbody mb">{q.body}</div>
          <div className="opts">{['a', 'b', 'c', 'd'].map((l) => <button key={l} className="opt" onClick={() => answer(l)}><span className="bubble">{BN_LETTER[l]}</span><span>{q.options[l]}</span></button>)}</div>
        </div>
      ) : <div className="card center"><h3>✅ আপনার উত্তর শেষ</h3><p className="muted">প্রতিপক্ষ শেষ করলেই ফলাফল…</p><div className="spinner" style={{ margin: '0 auto' }} /></div>}
    </div>
  );
}

export function BattleJoin() {
  const { code } = useParams();
  const nav = useNavigate();
  const [err, setErr] = useState(null);
  useEffect(() => { api.post(`/social/battles/join/${code}`).then((d) => nav(`/app/battle/${d.id}`, { replace: true })).catch((e) => setErr(e.message)); }, [code, nav]);
  return err ? <ErrorBox error={err} /> : <Loader />;
}

// ================= Groups & batches =================
export function Groups() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { data, reload } = useFetch('/social/groups');
  const [create, setCreate] = useState(false);
  const [f, setF] = useState({ name: '', description: '', is_public: true, kind: 'group' });
  const [code, setCode] = useState('');
  const [err, setErr] = useState(null);
  const staff = ['teacher', 'admin'].includes(user.role);
  const make = async () => { setErr(null); try { const d = await api.post('/social/groups', f); nav(`/app/groups/${d.id}`); } catch (e) { setErr(e.message); } };
  const join = async (c) => { setErr(null); try { const d = await api.post(`/social/groups/join/${c}`); nav(`/app/groups/${d.id}`); } catch (e) { setErr(e.message); reload(); } };
  return (
    <div className="stack">
      <div className="page-head"><div><h1>👥 স্টাডি গ্রুপ{staff ? ' ও কোচিং ব্যাচ' : ''}</h1><p>একসাথে পড়ুন: গ্রুপ লিডারবোর্ড, গ্রুপ চ্যালেঞ্জ ও আলোচনা। একা পড়ার ক্লান্তি কমে, ধারাবাহিকতা বাড়ে।</p></div>
        <button className="btn" onClick={() => setCreate(true)}>+ নতুন {staff ? 'গ্রুপ/ব্যাচ' : 'গ্রুপ'}</button></div>
      <ErrorBox error={err} />
      <div className="card row">
        <b className="small">কোড দিয়ে যোগ দিন:</b>
        <input className="input" style={{ maxWidth: 160, textTransform: 'uppercase' }} value={code} onChange={(e) => setCode(e.target.value)} aria-label="গ্রুপ কোড" />
        <button className="btn ghost" disabled={!code} onClick={() => join(code.trim())}>যোগ দিন</button>
      </div>
      <h3>আমার গ্রুপ</h3>
      {!data ? <Loader /> : !data.mine.length ? <div className="card"><Empty icon="👥" title="এখনো কোনো গ্রুপে নেই">বন্ধুদের নিয়ে একটি গ্রুপ খুলুন, অথবা নিচের পাবলিক গ্রুপে যোগ দিন।</Empty></div> : (
        <div className="grid g3">{data.mine.map((g) => (
          <Link key={g.id} to={`/app/groups/${g.id}`} className="card exam-tile">
            <div className="row between"><span className={`badge ${g.kind === 'batch' ? 'accent' : ''}`}>{g.kind === 'batch' ? 'কোচিং ব্যাচ' : 'স্টাডি গ্রুপ'}</span><span className="tiny muted">{bn(g.members)} জন</span></div>
            <b>{g.name}</b><span className="small muted">{g.exam || ''}{g.role !== 'member' ? ` · ${g.role === 'owner' ? 'মালিক' : 'শিক্ষক'}` : ''}</span>
          </Link>
        ))}</div>
      )}
      {data?.suggested.length > 0 && <>
        <h3>আপনার পরীক্ষার পাবলিক গ্রুপ</h3>
        <div className="grid g3">{data.suggested.map((g) => (
          <div key={g.id} className="card"><b>{g.name}</b><div className="small muted">{g.description || g.exam} · {bn(g.members)} জন</div><button className="btn ghost sm mt" onClick={() => join(g.code)}>যোগ দিন</button></div>
        ))}</div>
      </>}
      <Modal open={create} onClose={() => setCreate(false)} title="নতুন গ্রুপ">
        {staff && <div className="chips mb">{[['group', 'স্টাডি গ্রুপ'], ['batch', 'কোচিং ব্যাচ']].map(([k, l]) => <button key={k} className={`chip ${f.kind === k ? 'active' : ''}`} onClick={() => setF({ ...f, kind: k })}>{l}</button>)}</div>}
        <div className="field"><label htmlFor="gn">নাম</label><input id="gn" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="যেমন: ৫১তম বিসিএস — রাজশাহী বিশ্ববিদ্যালয়" /></div>
        <div className="field"><label htmlFor="gd">বিবরণ</label><input id="gd" className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        {f.kind === 'group' && <label className="row small mb"><input type="checkbox" checked={f.is_public} onChange={(e) => setF({ ...f, is_public: e.target.checked })} /> পাবলিক — একই পরীক্ষার অন্যরা খুঁজে যোগ দিতে পারবে</label>}
        {f.kind === 'batch' && <p className="small muted">ব্যাচে শুধু শিক্ষক অ্যাসাইনমেন্ট দিতে পারবেন এবং সব শিক্ষার্থীর নির্ভুলতা ও সম্পন্নের হার দেখতে পাবেন।</p>}
        <button className="btn block" onClick={make} disabled={f.name.trim().length < 3}>তৈরি করুন</button>
      </Modal>
    </div>
  );
}

export function GroupPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { data: g, error, loading, reload } = useFetch(`/social/groups/${id}`);
  const [post, setPost] = useState('');
  const [assign, setAssign] = useState(false);
  const [af, setAf] = useState({ title: '', count: 20, due_at: '' });
  const [board, setBoard] = useState(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState(null);
  if (loading && !g) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  const send = async () => { await api.post(`/social/groups/${id}/posts`, { body: post }); setPost(''); reload(); };
  const makeAssign = async () => { setErr(null); try { await api.post(`/social/groups/${id}/assignments`, af); setAssign(false); reload(); } catch (e) { setErr(e.message); } };
  const leave = async () => { await api.post(`/social/groups/${id}/leave`); nav('/app/groups'); };
  const staffView = g.role === 'owner' || g.role === 'teacher';
  return (
    <div className="stack">
      <div className="page-head">
        <div><span className={`badge ${g.kind === 'batch' ? 'accent' : ''}`}>{g.kind === 'batch' ? 'কোচিং ব্যাচ' : 'স্টাডি গ্রুপ'}</span><h1 className="mt" style={{ marginTop: '.4rem' }}>{g.name}</h1><p>{g.description || ''}</p></div>
        <div className="row">
          <button className="btn light" onClick={async () => setCopied(await copy(`আরোহণে "${g.name}" গ্রুপে যোগ দাও — কোড: ${g.code}`))}>{copied ? '✓ কপি হয়েছে' : `আমন্ত্রণ কোড: ${g.code}`}</button>
          {(g.can_assign || g.kind === 'group') && <button className="btn" onClick={() => setAssign(true)}>+ {g.kind === 'batch' ? 'অ্যাসাইনমেন্ট' : 'গ্রুপ চ্যালেঞ্জ'}</button>}
        </div>
      </div>
      <ErrorBox error={err} />
      <div className="grid g-main">
        <div className="stack">
          <div className="card">
            <h3>📝 {g.kind === 'batch' ? 'অ্যাসাইনমেন্ট' : 'গ্রুপ চ্যালেঞ্জ'}</h3>
            {!g.assignments.length ? <p className="small muted">এখনো কিছু নেই।</p> : g.assignments.map((a) => (
              <div key={a.id} className="row between" style={{ padding: '.5rem 0', borderBottom: '1px dashed var(--line)' }}>
                <span className="small"><b>{a.title}</b><br /><span className="tiny muted">{bn(a.questions)} প্রশ্ন · {bn(a.done)}/{bn(g.members.length)} জন সম্পন্ন{a.due_at ? ` · শেষ সময় ${fmtDate(a.due_at, true)}` : ''}{a.avg_score != null ? ` · গড় ${bn(Number(a.avg_score))}` : ''}</span></span>
                <span className="row">
                  {a.my_attempt ? <Link className="btn light sm" to={`/app/result/${a.my_attempt}`}>আমার ফল</Link> : <Link className="btn sm" to={`/exam/${a.test_id}`}>শুরু</Link>}
                  <button className="btn ghost sm" onClick={async () => setBoard(await api.get(`/social/groups/${id}/assignments/${a.id}`))}>র‍্যাংকিং</button>
                </span>
              </div>
            ))}
          </div>
          <div className="card">
            <h3>💬 আলোচনা</h3>
            <div className="row"><input className="input" style={{ flex: 1 }} placeholder="প্রশ্ন, টিপস বা উৎসাহ লিখুন…" value={post} onChange={(e) => setPost(e.target.value)} aria-label="পোস্ট" /><button className="btn" disabled={post.trim().length < 2} onClick={send}>পোস্ট</button></div>
            {g.posts.map((p) => (
              <div key={p.id} style={{ padding: '.55rem 0', borderBottom: '1px dashed var(--line)' }}>
                <div className="small"><b>{p.name}</b> {p.role && p.role !== 'member' && <span className="badge">{p.role === 'owner' ? 'মালিক' : 'শিক্ষক'}</span>} <span className="tiny muted">{fmtDate(p.created_at, true)}</span>
                  {(p.user_id === user.id || staffView) && <button className="linkbtn tiny" style={{ marginLeft: 6, color: 'var(--bad)' }} onClick={async () => { await api.del(`/social/groups/${id}/posts/${p.id}`); reload(); }}>মুছুন</button>}</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{p.body}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>🏆 এই সপ্তাহের লিডারবোর্ড</h3>
          {g.members.map((m, i) => (
            <div key={m.id} className={`row between small ${m.id === user.id ? 'tone-good' : ''}`} style={{ padding: '.35rem 0', borderBottom: '1px dashed var(--line)' }}>
              <span>{i < 3 ? ['🥇', '🥈', '🥉'][i] : bn(i + 1)}. {m.name}{m.streak >= 3 ? ` 🔥${bn(m.streak)}` : ''}</span>
              <span>{bn(m.week_xp)} XP{staffView && m.accuracy != null ? ` · ${bn(m.accuracy)}%` : ''}</span>
            </div>
          ))}
          {staffView && <p className="tiny muted mt">শিক্ষক/মালিক হিসেবে আপনি সদস্যদের ৩০ দিনের নির্ভুলতা দেখছেন।</p>}
          {g.role !== 'owner' && <button className="linkbtn small mt" style={{ color: 'var(--bad)' }} onClick={leave}>গ্রুপ ছাড়ুন</button>}
        </div>
      </div>

      <Modal open={assign} onClose={() => setAssign(false)} title={g.kind === 'batch' ? 'নতুন অ্যাসাইনমেন্ট' : 'নতুন গ্রুপ চ্যালেঞ্জ'}>
        <div className="field"><label htmlFor="at">শিরোনাম</label><input id="at" className="input" value={af.title} onChange={(e) => setAf({ ...af, title: e.target.value })} /></div>
        <div className="grid g2">
          <div className="field"><label htmlFor="ac">প্রশ্নসংখ্যা</label><input id="ac" type="number" className="input" value={af.count} onChange={(e) => setAf({ ...af, count: Number(e.target.value) })} /></div>
          <div className="field"><label htmlFor="ad">শেষ সময় (ঐচ্ছিক)</label><input id="ad" type="datetime-local" className="input" value={af.due_at} onChange={(e) => setAf({ ...af, due_at: e.target.value })} /></div>
        </div>
        <p className="tiny muted">প্রশ্ন বাছাই হবে গ্রুপের লক্ষ্য পরীক্ষার বিষয়-বণ্টন অনুযায়ী। সবাই একই প্রশ্ন পাবে।</p>
        <button className="btn block" onClick={makeAssign}>তৈরি করুন</button>
      </Modal>

      <Modal open={!!board} onClose={() => setBoard(null)} title={board?.title || ''} wide>
        {board && <>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>#</th><th>নাম</th><th>স্কোর</th><th>সঠিক/ভুল</th><th>সময়</th></tr></thead>
            <tbody>{board.rows.map((r, i) => (
              <tr key={r.id} className={r.id === user.id ? 'me' : ''}><td>{r.score == null ? '—' : bn(i + 1)}</td><td>{r.name}</td>
                <td>{r.score == null ? <span className="badge gray">দেয়নি</span> : <b>{bn(r.score)}</b>}</td><td>{r.score == null ? '—' : `${bn(r.correct)}/${bn(r.wrong)}`}</td><td>{r.score == null ? '—' : fmtDuration(r.time_spent_sec)}</td></tr>
            ))}</tbody>
          </table></div>
          {board.staff && board.hardest.length > 0 && <><h3 className="mt">ক্লাসের জন্য সবচেয়ে কঠিন প্রশ্ন</h3>{board.hardest.map((h) => <div key={h.id} className="row between small" style={{ padding: '.3rem 0' }}><Link to={`/app/question/${h.id}`}>{h.body}</Link><span className="tone-bad">{bn(h.accuracy)}%</span></div>)}</>}
        </>}
      </Modal>
    </div>
  );
}

export function ReferralCard() {
  const { data } = useFetch('/social/referral');
  const [copied, setCopied] = useState(false);
  if (!data) return null;
  const link = `${window.location.origin}/register?ref=${data.code}`;
  return (
    <div className="card">
      <h3>🎁 বন্ধুকে আমন্ত্রণ জানান</h3>
      <p className="small muted">আপনার লিংকে যোগ দিলে বন্ধু পাবে ৭ দিন বাড়তি ট্রায়াল। বন্ধু প্রথম বাস্তব টেস্ট (১০+ প্রশ্ন) শেষ করলে আপনি পাবেন ৭ দিনের এক্সাম পাস।</p>
      <div className="row"><code style={{ fontSize: '1.1rem', fontWeight: 700 }}>{data.code}</code>
        <button className="btn sm" onClick={async () => setCopied(await copy(`আরোহণে ফ্রি অ্যাকাউন্ট খোলো — বিসিএস/ভর্তি/একাডেমিক প্রস্তুতির পার্সোনাল সিস্টেম: ${link}`))}>{copied ? '✓ কপি হয়েছে' : 'লিংক কপি করুন'}</button></div>
      <p className="tiny muted mt">যোগ দিয়েছেন {bn(data.joined)} জন · বোনাস পেয়েছেন {bn(data.rewarded)} বার</p>
    </div>
  );
}
