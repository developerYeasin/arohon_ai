// More public pages: exam landing pages, free demo exam, package detail, printable OMR sheet,
// resources hub and partnership enquiries.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { useFetch, Loader, ErrorBox, Empty } from '../components/ui.jsx';
import PublicLayout, { PageHero } from '../components/PublicLayout.jsx';
import { POST_TYPES, PostCard, PackageGrid, CtaBand, MessageForm } from './Site.jsx';
import { PRO_FEATURES, FREE_FEATURES } from '../features.js';
import { bn, fmtDate, TRACKS } from '../utils.js';

const BN_OPT = { a: 'ক', b: 'খ', c: 'গ', d: 'ঘ' };

// ---------- Exam landing page ----------
export function ExamPage() {
  const { code } = useParams();
  const { user } = useAuth();
  const { data, error, loading } = useFetch(`/site/exam/${encodeURIComponent(code)}`, [code]);
  if (loading) return <PublicLayout><Loader /></PublicLayout>;
  if (error) return <PublicLayout><section className="section"><div className="container"><ErrorBox error={error} /></div></section></PublicLayout>;
  const { exam: e, subjects, posts } = data;
  const total = subjects.reduce((n, s) => n + s.question_count, 0) || e.total_questions;
  const neg = Number(e.negative_mark);
  return (
    <PublicLayout>
      <PageHero kicker={`${TRACKS[e.track]?.icon || ''} ${TRACKS[e.track]?.bn || ''}`} title={`${e.name_bn} — পূর্ণ প্রস্তুতি`} sub={e.description}>
        <div className="row mt">
          <Link className="btn accent lg" to={user ? '/app' : '/register'}>{user ? 'প্রস্তুতি শুরু করুন' : 'ফ্রি অ্যাকাউন্ট খুলুন'}</Link>
          <Link className="btn ghost lg" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.35)' }} to="/demo-exam">ডেমো পরীক্ষা দিন</Link>
        </div>
      </PageHero>
      <section className="section"><div className="container stack">
        <div className="grid g4">
          <div className="card stat"><span className="v">{bn(e.total_questions)}</span><span className="l">মোট প্রশ্ন / নম্বর</span></div>
          <div className="card stat"><span className="v">{bn(e.duration_min)} মিনিট</span><span className="l">সময় · প্রশ্নপ্রতি ~{bn(e.sec_per_question)} সেকেন্ড</span></div>
          <div className="card stat"><span className="v">{neg ? `−${bn(neg)}` : 'নেই'}</span><span className="l">প্রতি ভুলে নেগেটিভ মার্ক</span></div>
          <div className="card stat"><span className="v">{e.next_exam_date ? fmtDate(e.next_exam_date) : '—'}</span><span className="l">পরবর্তী সম্ভাব্য পরীক্ষা</span></div>
        </div>
        {subjects.length > 0 && (
          <div className="card">
            <h3>📋 বিষয়ভিত্তিক নম্বর বণ্টন</h3>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>বিষয়</th><th>প্রশ্ন / নম্বর</th><th style={{ width: '35%' }}>অংশ</th><th>আরোহণে প্রশ্ন</th></tr></thead>
              <tbody>{subjects.map((s) => (
                <tr key={s.id}><td><b>{s.name_bn}</b></td><td>{bn(s.question_count)}</td>
                  <td><div className="progress"><span style={{ width: `${(s.question_count * 100) / total}%` }} /></div></td>
                  <td>{bn(s.bank)}</td></tr>
              ))}</tbody>
            </table></div>
            <p className="tiny muted" style={{ marginBottom: 0 }}>আরোহণের মডেল টেস্ট এই বণ্টন মেনেই তৈরি হয়; অ্যাডাপটিভ টেস্ট বেশি নম্বরের দুর্বল বিষয়কে অগ্রাধিকার দেয়।</p>
          </div>
        )}
        {posts.length > 0 && <><h3 className="mt">📢 {e.name_bn}: সর্বশেষ আপডেট</h3><div className="grid g3">{posts.map((p) => <PostCard key={p.id} p={p} />)}</div></>}
      </div></section>
      <section className="section alt"><div className="container"><h2>প্যাকেজ</h2><p className="sub">একটি এক্সাম পাসেই সব পরীক্ষার সব ফিচার।</p><PackageGrid /></div></section>
      <CtaBand />
    </PublicLayout>
  );
}

// ---------- Free demo exam (no login) ----------
const DEMO_SEC_PER_Q = 36;

export function DemoExam() {
  const [track, setTrack] = useState('job');
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [left, setLeft] = useState(0);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const startedAt = useRef(0);

  const start = async () => {
    setErr(null); setBusy(true);
    try {
      const q = await api.get(`/public/daily?track=${track}`);
      if (!q.questions.length) throw new Error('এই ট্র্যাকে এখনো প্রশ্ন নেই');
      setQuiz(q); setAnswers({}); setResult(null); setLeft(q.questions.length * DEMO_SEC_PER_Q); startedAt.current = Date.now();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const submit = useCallback(async () => {
    if (!quiz || result) return;
    setBusy(true);
    try {
      setResult(await api.post('/public/submit', { kind: 'daily', key: quiz.key, answers, time_sec: Math.round((Date.now() - startedAt.current) / 1000) }));
      window.scrollTo(0, 0);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }, [quiz, answers, result]);

  useEffect(() => {
    if (!quiz || result || busy) return undefined;
    if (left <= 0) { submit(); return undefined; }
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [quiz, result, left, busy, submit]);
  // Leaving mid-exam loses the attempt, like the real exam hall.
  useEffect(() => {
    if (!quiz || result) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [quiz, result]);

  const mmss = `${bn(String(Math.floor(left / 60)).padStart(2, '0'))}:${bn(String(left % 60).padStart(2, '0'))}`;
  const wrong = result ? result.review.filter((r) => r.selected && r.selected !== r.correct).length : 0;
  return (
    <PublicLayout>
      <PageHero kicker="ফ্রি ডেমো পরীক্ষা" title="লগইন ছাড়াই একটা ছোট পরীক্ষা দিন" sub="আসল পরীক্ষার মতো সময় ধরে — শেষে দেখবেন কত পেলেন, নেগেটিভ মার্কিংসহ কত দাঁড়াত, আর প্রতিটি প্রশ্নের ব্যাখ্যা।" />
      <section className="section"><div className="container" style={{ maxWidth: 860 }}>
        <ErrorBox error={err} />
        {!quiz ? (
          <div className="card stack">
            <h3>পরীক্ষার নিয়ম</h3>
            <div className="grid g2 small">
              <div>⏱ প্রশ্নপ্রতি {bn(DEMO_SEC_PER_Q)} সেকেন্ড — সময় শেষে নিজে থেকে জমা হবে</div>
              <div>➖ ফলাফলে ০.২৫ নেগেটিভ মার্কিং ধরে হিসাব দেখানো হবে</div>
              <div>🚪 পরীক্ষার মাঝে পাতা ছাড়লে উত্তর হারাবেন</div>
              <div>📚 বিভিন্ন বিষয় থেকে মেশানো প্রশ্ন, প্রতিদিন নতুন সেট</div>
            </div>
            <div className="track-pick">{['job', 'admission', 'academic'].map((t) => (
              <button key={t} type="button" className={track === t ? 'on' : ''} onClick={() => setTrack(t)}><span className="i">{TRACKS[t].icon}</span>{TRACKS[t].bn}</button>
            ))}</div>
            <button className="btn accent lg" disabled={busy} onClick={start}>{busy ? 'লোড হচ্ছে…' : 'পরীক্ষা শুরু করুন'}</button>
          </div>
        ) : !result ? (
          <div className="stack">
            <div className="card row between" style={{ position: 'sticky', top: 72, zIndex: 5 }}>
              <b>{bn(Object.keys(answers).length)}/{bn(quiz.questions.length)} উত্তর দেওয়া</b>
              <span className={`badge ${left < 60 ? 'bad' : ''}`} style={{ fontSize: '1rem' }}>⏱ {mmss}</span>
              <button className="btn sm" disabled={busy} onClick={submit}>{busy ? 'জমা হচ্ছে…' : 'জমা দিন'}</button>
            </div>
            {quiz.questions.map((q, i) => (
              <div key={q.id} className="card">
                <div className="tiny muted">{q.subject}</div>
                <b>{bn(i + 1)}. {q.body}</b>
                <div className="grid g2 mt">{['a', 'b', 'c', 'd'].map((k) => (
                  <button key={k} type="button" className={`chip ${answers[q.id] === k ? 'active' : ''}`} style={{ textAlign: 'left', borderRadius: 10 }}
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: k }))}>{BN_OPT[k]}. {q.options[k]}</button>
                ))}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="stack">
            <div className="card hero-card center">
              <h2 style={{ color: '#fff' }}>{bn(result.score)} / {bn(result.total)} সঠিক</h2>
              <p className="muted">ভুল {bn(wrong)} · উত্তর দেননি {bn(result.total - result.score - wrong)} · নেগেটিভ মার্কিংসহ নম্বর <b style={{ color: '#fff' }}>{bn(result.score - wrong * 0.25)}</b>
                {result.percentile != null && <> · আজ {bn(result.players)} জনের মধ্যে {bn(result.percentile)}% এর চেয়ে ভালো</>}</p>
              <div className="row" style={{ justifyContent: 'center' }}>
                <Link className="btn accent" to="/register">পূর্ণ বিশ্লেষণের জন্য ফ্রি অ্যাকাউন্ট</Link>
                <button className="btn light" onClick={() => { setQuiz(null); setResult(null); }}>আবার দিন</button>
              </div>
            </div>
            {result.review.map((r, i) => (
              <div key={r.id} className="card">
                <b>{bn(i + 1)}. {r.body}</b>
                <div className="small mt">{['a', 'b', 'c', 'd'].map((k) => (
                  <div key={k} className={k === r.correct ? 'tone-good' : k === r.selected ? 'tone-bad' : ''}>{k === r.correct ? '✓' : k === r.selected ? '✗' : '·'} {BN_OPT[k]}. {r.options[k]}</div>
                ))}</div>
                {r.explanation && <div className="explain small mt">{r.explanation}</div>}
              </div>
            ))}
          </div>
        )}
      </div></section>
    </PublicLayout>
  );
}

// ---------- Package detail ----------
export function PackageDetail() {
  const { code } = useParams();
  const { user } = useAuth();
  const { data: billing, loading } = useFetch('/billing/plans');
  const p = billing?.plans.find((x) => x.code === code);
  return (
    <PublicLayout>
      {loading ? <Loader /> : !p ? <section className="section"><div className="container"><div className="card"><Empty title="প্যাকেজ পাওয়া যায়নি"><Link to="/packages">সব প্যাকেজ</Link></Empty></div></div></section> : <>
        <PageHero kicker="প্যাকেজ" title={p.name_bn} sub={`৳${bn(p.price_bdt)} · মেয়াদ ${bn(p.duration_days)} দিন · কোনো অটো-রিনিউ নেই`} />
        <section className="section"><div className="container grid g-main">
          <div className="card">
            <h3>এই প্যাকেজে যা পাবেন</h3>
            <ul style={{ paddingLeft: '1.1rem', lineHeight: 1.9 }}>{PRO_FEATURES.map((l) => <li key={l}>{l}</li>)}{!p.includes_ai_coach && <li className="muted">এআই কোচ সীমিত</li>}</ul>
            <h3 className="mt">সাথে ফ্রি অংশের সবকিছু</h3>
            <ul className="small muted" style={{ paddingLeft: '1.1rem' }}>{FREE_FEATURES.map((l) => <li key={l}>{l}</li>)}</ul>
          </div>
          <div className="card" style={{ borderColor: 'var(--brand)', borderWidth: 2 }}>
            {p.highlight && <span className="badge accent">{p.highlight}</span>}
            <div style={{ fontSize: '2rem', fontWeight: 700 }}>৳{bn(p.price_bdt)}</div>
            <div className="small muted mb">দিনপ্রতি প্রায় ৳{bn(Math.ceil(p.price_bdt / p.duration_days))}</div>
            <Link to={user ? '/app/billing' : '/register'} className="btn block lg">{user ? 'এখনই নিন' : `রেজিস্ট্রেশন করুন — ${bn(billing.trial_days)} দিন ফ্রি ট্রায়াল`}</Link>
            <p className="tiny muted mt">পেমেন্ট: bKash, Nagad, Rocket · <Link to="/terms">রিফান্ড নীতি</Link> · <Link to="/faq">প্রশ্নোত্তর</Link></p>
          </div>
        </div></section>
      </>}
    </PublicLayout>
  );
}

// ---------- Printable OMR sheet ----------
export function Omr() {
  const [count, setCount] = useState(100);
  const cols = 4;
  const perCol = Math.ceil(count / cols);
  return (
    <PublicLayout>
      <div className="no-print">
        <PageHero kicker="OMR" title="ঘরে বসে OMR শিটে অনুশীলন" sub="পরীক্ষার হলে বৃত্ত ভরাটের ভুলেও নম্বর যায়। প্রিন্ট করে আরোহণের মডেল টেস্টের সাথে অনুশীলন করুন — অ্যাপের ভেতরেও OMR মোড আছে।" />
        <section className="section"><div className="container grid g-main">
          <div className="card">
            <h3>যেভাবে অনুশীলন করবেন</h3>
            <ol className="small" style={{ paddingLeft: '1.1rem', lineHeight: 1.9 }}>
              <li>নিচের শিটটি A4 কাগজে প্রিন্ট করুন (প্রিন্ট সেটিংসে "Fit to page")।</li>
              <li>আরোহণে একটি মডেল টেস্ট শুরু করুন, উত্তর শুধু কাগজের শিটে কালো বলপেনে দিন।</li>
              <li>প্রতিটি বৃত্ত সম্পূর্ণ ও গাঢ় করে ভরাট করুন — টিক, ক্রস বা আংশিক দাগ নয়।</li>
              <li>একবার ভরাট করা বৃত্ত বদলানো যায় না, তাই নিশ্চিত হয়ে তবেই দাগ দিন।</li>
              <li>সময় শেষে শিট থেকে অ্যাপে উত্তর তুলে জমা দিন — কোথায় ভুল ভরাট করলেন মিলিয়ে নিন।</li>
            </ol>
          </div>
          <div className="card">
            <h3>শিট সাজান</h3>
            <div className="field"><label htmlFor="omr-n">প্রশ্নের সংখ্যা</label>
              <select id="omr-n" className="input" value={count} onChange={(e) => setCount(Number(e.target.value))}>{[50, 100, 200].map((n) => <option key={n} value={n}>{bn(n)}</option>)}</select></div>
            <button className="btn block" onClick={() => window.print()}>🖨️ প্রিন্ট / PDF হিসেবে সেভ</button>
          </div>
        </div></section>
      </div>
      <div className="container"><div className="omr-sheet">
        <div className="omr-head">
          <b>⛰️ আরোহণ — অনুশীলন OMR</b>
          <div className="omr-fields"><span>নাম: ____________________</span><span>পরীক্ষা: ______________</span><span>তারিখ: __________</span><span>প্রাপ্ত নম্বর: ______</span></div>
        </div>
        <div className="omr-print-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {Array.from({ length: cols }, (_, c) => (
            <div key={c}>{Array.from({ length: perCol }, (_, r) => c * perCol + r + 1).filter((n) => n <= count).map((n) => (
              <div key={n} className="omr-row"><span className="omr-n">{bn(n)}</span>{['ক', 'খ', 'গ', 'ঘ'].map((o) => <span key={o} className="omr-b">{o}</span>)}</div>
            ))}</div>
          ))}
        </div>
      </div></div>
    </PublicLayout>
  );
}

// ---------- Resources hub ----------
function LatestOf({ type }) {
  const { data } = useFetch(`/site/posts?type=${type}&limit=3`);
  if (!data?.rows.length) return <p className="small muted" style={{ margin: 0 }}>শীঘ্রই যুক্ত হবে।</p>;
  return data.rows.map((p) => <div key={p.id} className="small" style={{ padding: '.25rem 0' }}><Link to={`${POST_TYPES[type].path}/${p.slug}`}>{p.title}</Link></div>);
}

export function ResourcesHub() {
  const { user } = useAuth();
  return (
    <PublicLayout>
      <PageHero kicker="রিসোর্স" title="প্রস্তুতির সব রিসোর্স এক জায়গায়" sub="PDF ও নোট, ভিডিও ক্লাস, পরীক্ষার রুটিন, সার্কুলার আর বিগত বছরের প্রশ্ন বিশ্লেষণ।" />
      <section className="section"><div className="container grid g2">
        {['resource', 'video', 'notice', 'circular'].map((t) => (
          <div key={t} className="card">
            <div className="row between"><h3 style={{ margin: 0 }}>{POST_TYPES[t].icon} {POST_TYPES[t].title}</h3><Link to={POST_TYPES[t].path} className="small">সব দেখুন →</Link></div>
            <p className="small muted">{POST_TYPES[t].sub}</p>
            <LatestOf type={t} />
          </div>
        ))}
        <div className="card">
          <h3>📊 বিগত প্রশ্ন আর্কাইভ ও বিশ্লেষণ</h3>
          <p className="small muted">বিগত পরীক্ষার প্রশ্ন বিষয় ও টপিক ধরে — কোন টপিক থেকে কত প্রশ্ন আসে।</p>
          <Link className="btn sm" to={user ? '/app/intelligence' : '/register'}>{user ? 'আর্কাইভ খুলুন' : 'ফ্রি অ্যাকাউন্টে দেখুন'}</Link>
        </div>
        <div className="card">
          <h3>🖨️ OMR শিট</h3>
          <p className="small muted">প্রিন্ট করে ঘরে বসে আসল পরীক্ষার মতো অনুশীলন।</p>
          <Link className="btn sm" to="/omr">OMR ডাউনলোড</Link>
        </div>
      </div></section>
    </PublicLayout>
  );
}

// ---------- Partnership ----------
export function Partnership() {
  return (
    <PublicLayout>
      <PageHero kicker="পার্টনারশিপ" title="শিক্ষার্থীদের জন্য কিছু করতে চান? একসাথে করি।" sub="ক্যাম্পাস কুইজ, ক্যারিয়ার ইভেন্ট, কোচিং বা প্রতিষ্ঠানের জন্য পরীক্ষা — আমরা প্ল্যাটফর্ম, প্রশ্ন আর ফলাফল বিশ্লেষণ দিয়ে পাশে থাকতে পারি।" />
      <section className="section"><div className="container grid g-main">
        <div className="card"><MessageForm kind="partnership" topics={['ক্যাম্পাস / ক্লাব ইভেন্ট', 'কোচিং / প্রতিষ্ঠান', 'স্পনসরশিপ', 'কনটেন্ট / মেন্টর হিসেবে যুক্ত হওয়া', 'অন্যান্য']} /></div>
        <div className="card">
          <h3>যা জানালে দ্রুত এগোনো যায়</h3>
          <ul className="small" style={{ paddingLeft: '1.1rem', lineHeight: 1.9 }}>
            <li>আয়োজক প্রতিষ্ঠান ও যোগাযোগের মানুষ</li>
            <li>ইভেন্টের ধরন, তারিখ ও স্থান (অনলাইন/অফলাইন)</li>
            <li>আনুমানিক অংশগ্রহণকারী ও তাঁদের লক্ষ্য পরীক্ষা</li>
            <li>আমাদের কাছ থেকে কী চান — প্রশ্ন, প্ল্যাটফর্ম, পুরস্কার বা প্রচার</li>
            <li>আপনার দিক থেকে কী থাকবে</li>
          </ul>
        </div>
      </div></section>
    </PublicLayout>
  );
}

// ---------- Public live-exam routine ----------
const dhakaDay = (d) => new Intl.DateTimeFormat('bn-BD', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Dhaka' }).format(new Date(d));
const dhakaTime = (d) => new Intl.DateTimeFormat('bn-BD', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Dhaka' }).format(new Date(d));

export function Routine() {
  const { user } = useAuth();
  const [track, setTrack] = useState('');
  const { data, error, loading } = useFetch(`/site/routine${track ? `?track=${track}` : ''}`, [track]);
  const days = [];
  for (const t of data || []) {
    const key = dhakaDay(t.starts_at);
    if (!days.length || days[days.length - 1][0] !== key) days.push([key, []]);
    days[days.length - 1][1].push(t);
  }
  return (
    <PublicLayout>
      <PageHero kicker="📅 লাইভ পরীক্ষা" title="লাইভ পরীক্ষার রুটিন" sub="আগামী ৩০ দিনের সব লাইভ পরীক্ষা — নির্ধারিত সময়ে সবার সাথে বসুন, শেষ হলে মেধাতালিকা ও কাট মার্ক দেখুন।" />
      <section className="section"><div className="container stack">
        <div className="chips">
          <button className={`chip ${!track ? 'active' : ''}`} onClick={() => setTrack('')}>সব</button>
          {['job', 'admission', 'academic'].map((t) => <button key={t} className={`chip ${track === t ? 'active' : ''}`} onClick={() => setTrack(t)}>{TRACKS[t].icon} {TRACKS[t].bn}</button>)}
        </div>
        {loading && !data ? <Loader /> : error ? <ErrorBox error={error} /> : !days.length ? <div className="card"><Empty icon="📅" title="আগামী ৩০ দিনে কোনো লাইভ পরীক্ষা নির্ধারিত নেই" /></div>
          : days.map(([day, tests]) => (
            <div key={day} className="card">
              <h3>{day}</h3>
              <div className="table-wrap"><table className="table">
                <thead><tr><th>সময়</th><th>পরীক্ষা</th><th>প্রশ্ন</th><th>সময়সীমা</th><th>নেগেটিভ</th><th /></tr></thead>
                <tbody>{tests.map((t) => (
                  <tr key={t.id}>
                    <td>{dhakaTime(t.starts_at)}{t.running && <div><span className="badge live">চলছে</span></div>}</td>
                    <td><b>{t.title}</b>{t.exam_name && <div className="tiny muted">{t.exam_name}</div>}</td>
                    <td>{bn(t.questions)}</td>
                    <td>{bn(Math.round(t.duration_sec / 60))} মিনিট</td>
                    <td>{t.negative_mark ? bn(t.negative_mark) : 'নেই'}</td>
                    <td><Link className="btn sm" to={user ? '/app/live' : '/register'}>{t.running ? 'অংশ নিন' : user ? 'দেখুন' : 'রেজিস্টার'}</Link></td>
                  </tr>
                ))}</tbody>
              </table></div>
            </div>
          ))}
      </div></section>
    </PublicLayout>
  );
}

// ---------- Help center ----------
const HELP = [
  ['🚀', 'শুরু করবেন কীভাবে', [
    'মোবাইল নম্বর বা ইমেইল দিয়ে ফ্রি অ্যাকাউন্ট খুলুন — নতুনদের জন্য ফ্রি ট্রায়াল থাকে।',
    'প্রোফাইলে লক্ষ্য পরীক্ষা, পরীক্ষার তারিখ আর দিনে কত মিনিট পড়বেন তা দিন। ড্যাশবোর্ড ও "আজকের মিশন" সেই অনুযায়ী সাজবে।',
    'প্রথমে একটা ডায়াগনস্টিক বা মডেল টেস্ট দিন — রেডিনেস স্কোর আর দুর্বল টপিক সেখান থেকেই বের হবে।',
  ]],
  ['🔴', 'লাইভ পরীক্ষা', [
    'রুটিনে দেওয়া সময়ের মধ্যে অ্যাপের "লাইভ পরীক্ষা" অংশ থেকে অংশ নিন।',
    'পরীক্ষা চলাকালীন ফলাফল ও সঠিক উত্তর লুকানো থাকে; নির্ধারিত সময় শেষ হলে সবার ফলাফল আর মেধাতালিকা একসাথে প্রকাশ হয়।',
    'স্কোর সমান হলে কম সময় নেওয়া পরীক্ষার্থী মেধাতালিকায় এগিয়ে থাকেন।',
  ]],
  ['✂️', 'কাট মার্ক কী', [
    'আরোহণে কাট মার্ক মানে একটি লাইভ পরীক্ষায় জমা দেওয়া সবার মধ্যে শীর্ষ ১০% এর সর্বনিম্ন নম্বর।',
    'অন্তত ২০ জন অংশ নিলে তবেই কাট মার্ক দেখানো হয় — কম অংশগ্রহণে সংখ্যাটা বিভ্রান্তিকর হতে পারে।',
    'এটা আসল পরীক্ষার পাস নম্বর নয়; আপনি প্রতিযোগীদের তুলনায় কোথায় আছেন, তার একটা ইঙ্গিত।',
  ]],
  ['🏛️', 'মডেল টেস্ট ও OMR', [
    'মডেল টেস্টে আসল পরীক্ষার মতো সময়, নেগেটিভ মার্কিং ও বিষয়ভিত্তিক নম্বর বণ্টন থাকে।',
    'পরীক্ষার পাতার পাশে OMR প্যানেলে কোন প্রশ্নে উত্তর দিয়েছেন, কোনটা 🚩 চিহ্নিত — এক নজরে দেখা যায়, যেকোনো প্রশ্নে লাফিয়ে যাওয়া যায়।',
    'কাগজে অনুশীলন করতে চাইলে OMR শিট প্রিন্ট করে নিন।',
  ]],
  ['🧠', 'ভুল ও রিভিশন', [
    'প্রতিটি ভুল ৯ ধরনের একটিতে ভাগ হয় — জানা ছিল না, ভুলে গেছি, অসাবধানতা, সময়ের চাপ, আন্দাজ ইত্যাদি। দরকার হলে আপনি নিজে ধরন বদলাতে পারেন।',
    'ভুল ও রিভিশনের প্রশ্ন ১-৩-৭-১৬-৩৫ দিনের ছন্দে ফিরে আসে, যতক্ষণ না আয়ত্তে আসে।',
  ]],
  ['✍️', 'লিখিত উত্তরের নম্বর', [
    'লিখিত উত্তর জমা দিলে সাথে সাথে একটি প্রাথমিক (provisional) নম্বর দেখানো হয় — এটি স্বয়ংক্রিয় বা এআই-নির্দেশক অনুমান।',
    'বিশেষজ্ঞ মূল্যায়ন করলে বিশেষজ্ঞের নম্বরই চূড়ান্ত।',
  ]],
  ['💳', 'প্যাকেজ ও পেমেন্ট', [
    'অনুশীলন, লাইভ পরীক্ষা ও ব্যাখ্যা ফ্রি; এক্সাম পাসে ব্যক্তিগত বিশ্লেষণ আর সীমাহীন টেস্ট।',
    'bKash, Nagad বা Rocket-এ পেমেন্ট করা যায়; কোনো অটো-রিনিউ নেই। ম্যানুয়াল পেমেন্টে লেনদেন নম্বর যাচাইয়ের পর পাস চালু হয়।',
    'পেমেন্টের অবস্থা অ্যাপের "প্ল্যান ও পেমেন্ট" পাতায় দেখুন। আরোহণ কখনো আপনার পিন বা OTP চায় না।',
  ]],
  ['⚠️', 'প্রশ্নে ভুল পেলে', [
    'প্রশ্নের পাশে "রিপোর্ট" চাপুন। একাধিক শিক্ষার্থী রিপোর্ট করলে প্রশ্নটি সাময়িকভাবে সরিয়ে বিশেষজ্ঞের কাছে যায়।',
    'সংশোধন হলে প্রশ্নের সংস্করণ ইতিহাসে লেখা থাকে, আর আপনার প্রোফাইলের "আমার রিপোর্ট করা প্রশ্ন" অংশে ফলাফল দেখা যায়।',
  ]],
];

export function Help() {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const sections = HELP.map(([i, t, items]) => [i, t, needle && !t.toLowerCase().includes(needle) ? items.filter((x) => x.toLowerCase().includes(needle)) : items])
    .filter(([, , items]) => items.length);
  return (
    <PublicLayout>
      <PageHero kicker="হেল্প সেন্টার" title="আরোহণ ব্যবহারের গাইড" sub="শুরু করা, লাইভ পরীক্ষা, কাট মার্ক, OMR, পেমেন্ট — যা জানা দরকার।">
        <input className="input mt" style={{ maxWidth: 520 }} placeholder="খুঁজুন (যেমন: কাট মার্ক, পেমেন্ট)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="গাইডে খুঁজুন" />
      </PageHero>
      <section className="section"><div className="container grid g2">
        {!sections.length ? <div className="card"><Empty icon="🔍" title="মিল পাওয়া যায়নি"><Link to="/faq">প্রশ্নোত্তর</Link> দেখুন বা <Link to="/contact">যোগাযোগ করুন</Link>।</Empty></div>
          : sections.map(([i, t, items]) => (
            <div key={t} className="card">
              <h3>{i} {t}</h3>
              <ul className="small" style={{ paddingLeft: '1.1rem', lineHeight: 1.85, margin: 0 }}>{items.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          ))}
      </div>
      <p className="center small muted mt">আরও জানতে: <Link to="/faq">প্রশ্নোত্তর</Link> · <Link to="/ask">মেন্টরকে প্রশ্ন</Link> · <Link to="/contact">যোগাযোগ</Link></p></section>
    </PublicLayout>
  );
}
