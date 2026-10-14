// Public website pages: about, features, packages, mentors, success stories, FAQ, content lists
// (blog / circulars / notices / resources), ask-a-mentor, contact, referral, search and privacy.
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { useFetch, Loader, ErrorBox, Empty } from '../components/ui.jsx';
import PublicLayout, { PageHero } from '../components/PublicLayout.jsx';
import { PRO_FEATURES, FREE_FEATURES } from '../features.js';
import { bn, fmtDate, TRACKS } from '../utils.js';

export const POST_TYPES = {
  blog: { path: '/blog', title: 'ব্লগ ও গাইড', sub: 'প্রস্তুতির কৌশল, সিলেবাস বিশ্লেষণ আর পরীক্ষার আগের পরিকল্পনা।', icon: '📝' },
  circular: { path: '/circulars', title: 'চাকরির সার্কুলার', sub: 'সরকারি ও বেসরকারি নিয়োগ বিজ্ঞপ্তি — আবেদনের শেষ তারিখসহ।', icon: '📢' },
  notice: { path: '/notices', title: 'নোটিশ ও রুটিন', sub: 'পরীক্ষার তারিখ, প্রবেশপত্র, ফলাফল ও সিলেবাস সংক্রান্ত আপডেট।', icon: '📅' },
  resource: { path: '/resources/pdf', title: 'PDF ও নোট', sub: 'লেকচার শিট, নোট আর স্টাডি গাইড — বিষয় ও পরীক্ষা ধরে।', icon: '📄' },
  video: { path: '/resources/videos', title: 'ভিডিও ক্লাস', sub: 'বিষয়ভিত্তিক ভিডিও ক্লাস ও প্রস্তুতির কৌশল।', icon: '🎬' },
};

// Every feature listed here exists in the app; keep this in sync with what is actually built.
export const ALL_FEATURES = [
  { i: '🎯', t: 'এক্সাম রেডিনেস স্কোর', d: 'বিষয়ভিত্তিক প্রস্তুতি, নির্ভুলতা, গতি, ধারাবাহিকতা ও মনে রাখার হার মিলিয়ে আনুমানিক প্রাপ্ত নম্বর আর সবচেয়ে বড় ঝুঁকি।', to: '/app/analytics' },
  { i: '⚡', t: 'অ্যাডাপটিভ টেস্ট', d: 'দুর্বল টপিক, পরীক্ষায় গুরুত্ব আর আপনার বর্তমান লেভেল দেখে প্রশ্ন বাছাই।', to: '/app/practice' },
  { i: '🏛️', t: 'আসল পরীক্ষার হল ও OMR', d: 'নির্দিষ্ট সময়, নেগেটিভ মার্কিং, OMR শিট, বিরতিহীন মোড ও স্বয়ংক্রিয় জমা।', to: '/app/practice' },
  { i: '🧠', t: 'মিসটেক ইন্টেলিজেন্স', d: 'ভুল ও উত্তর না দেওয়া প্রশ্ন ৯ ধরনে ভাগ হয় — প্রতিটির আলাদা সমাধান ও রি-টেস্ট।', to: '/app/mistakes' },
  { i: '🔁', t: 'স্পেসড রিভিশন', d: '১-৩-৭-১৬-৩৫ দিনের ছন্দে ঠিক যে প্রশ্নগুলো আজ রিভিশন দরকার, শুধু সেগুলো।', to: '/app/practice' },
  { i: '🤖', t: 'এআই কোচ', d: '"আজ কী পড়ব?", "কেন নম্বর কমছে?", "১০ দিন বাকি, কী বাদ দেব?" — আপনার নিজের ডেটা থেকে উত্তর।', to: '/app/coach' },
  { i: '🔴', t: 'লাইভ পরীক্ষা ও র‍্যাংকিং', d: 'নির্ধারিত সময়ে সবার সাথে পরীক্ষা, জাতীয়, জেলা ও প্রতিষ্ঠানভিত্তিক মেধাতালিকা।', to: '/app/live' },
  { i: '⚔️', t: '১-বনাম-১ ব্যাটল', d: 'বন্ধুকে কোড পাঠিয়ে একই প্রশ্নে প্রতিযোগিতা।', to: '/app/battles' },
  { i: '📊', t: 'বিগত প্রশ্ন বিশ্লেষণ', d: 'কোন টপিক থেকে কত প্রশ্ন আসে — বিগত পরীক্ষার ধারা দেখে প্রস্তুতি।', to: '/app/intelligence' },
  { i: '📰', t: 'সাম্প্রতিক বিষয়াবলি', d: 'খবর → মূল তথ্য → MCQ → সাপ্তাহিক টেস্ট।', to: '/app/current-affairs' },
  { i: '✍️', t: 'লিখিত ও ভাইভা প্রস্তুতি', d: 'লিখিত উত্তর জমা দিয়ে মূল্যায়ন, আর ভাইভার অনুশীলন সেশন।', to: '/app/written' },
  { i: '🗓️', t: 'স্টাডি প্ল্যানার', d: 'পরীক্ষার তারিখ আর দৈনিক সময় ধরে সপ্তাহভিত্তিক পরিকল্পনা।', to: '/app/planner' },
  { i: '🔖', t: 'বুকমার্ক ও আলোচনা', d: 'প্রশ্ন সংরক্ষণ, প্রতিটি প্রশ্নে আলোচনা ও বিশেষজ্ঞ-যাচাইকৃত উত্তর।', to: '/app/bookmarks' },
  { i: '👥', t: 'স্টাডি গ্রুপ', d: 'বন্ধু বা কোচিং ব্যাচ নিয়ে গ্রুপ, নিজেদের মেধাতালিকা।', to: '/app/groups' },
];

const Initial = ({ p }) => p.photo_url
  ? <img className="avatar" src={p.photo_url} alt={p.name} loading="lazy" />
  : <div className="avatar" aria-hidden="true">{p.name.slice(0, 1)}</div>;

// ---------- About ----------
export function About() {
  const { data: stats } = useFetch('/catalog/stats');
  return (
    <PublicLayout>
      <PageHero kicker="আমাদের গল্প" title="প্রশ্নব্যাংক নয়, প্রস্তুতির সিস্টেম" sub="হাজার হাজার MCQ সবার কাছেই আছে। ঘাটতি হলো দিকনির্দেশনা — কোনটা পড়বেন, কোথায় নম্বর হারাচ্ছেন, আর কতটা প্রস্তুত। আরোহণ সেই ঘাটতি পূরণ করতে তৈরি।" />
      <section className="section">
        <div className="container grid g-main">
          <div className="card">
            <h3>আমরা কী বিশ্বাস করি</h3>
            <ul className="small" style={{ paddingLeft: '1.1rem', lineHeight: 1.9 }}>
              <li>বেশি প্রশ্ন নয়, প্রতিটি প্রশ্ন থেকে বেশি শেখা।</li>
              <li>প্রতিটি ভুলের একটা কারণ আছে — আর প্রতিটি কারণের আলাদা সমাধান।</li>
              <li>স্কোর আর র‍্যাংক হবে বাস্তব — কোনো বানানো পরিসংখ্যান নয়।</li>
              <li>কোনো প্যাকেজ চাকরি বা ভর্তির নিশ্চয়তা দেয় না; আমরা দিই সঠিক প্রস্তুতির পথ।</li>
              <li>একাডেমিক থেকে ভর্তি, ভর্তি থেকে চাকরি — একই অ্যাকাউন্টে পুরো যাত্রা।</li>
            </ul>
          </div>
          <div className="card hero-card">
            <h3>সংখ্যায় আরোহণ</h3>
            <div className="grid g2">
              <div className="stat"><span className="v">{bn(stats?.exams ?? '—')}</span><span className="l">লক্ষ্য পরীক্ষা</span></div>
              <div className="stat"><span className="v">{bn(stats?.questions ?? '—')}</span><span className="l">যাচাইকৃত প্রশ্ন</span></div>
              <div className="stat"><span className="v">৩</span><span className="l">ট্র্যাক</span></div>
              <div className="stat"><span className="v">৯</span><span className="l">ধরনের ভুল বিশ্লেষণ</span></div>
            </div>
          </div>
        </div>
      </section>
      <HowItWorks />
      <CtaBand />
    </PublicLayout>
  );
}

export function HowItWorks() {
  const steps = [
    ['অ্যাকাউন্ট খুলুন', 'মোবাইল বা ইমেইল দিয়ে ফ্রি রেজিস্ট্রেশন — নতুনদের জন্য ফ্রি ট্রায়াল।'],
    ['লক্ষ্য ঠিক করুন', 'কোন পরীক্ষা, কবে, দিনে কত সময় — সেই অনুযায়ী আপনার ড্যাশবোর্ড সাজবে।'],
    ['প্রতিদিনের মিশন', 'আজকের জন্য বাছাই করা অনুশীলন, রিভিশন আর দুর্বল টপিক।'],
    ['পরীক্ষা ও বিশ্লেষণ', 'মডেল ও লাইভ টেস্ট, তারপর কোথায় নম্বর হারালেন তার পূর্ণ রিপোর্ট।'],
  ];
  return (
    <section className="section alt">
      <div className="container">
        <h2>যেভাবে কাজ করে</h2>
        <p className="sub">চার ধাপে শুরু — তারপর প্রতিদিন একটু করে এগোনো।</p>
        <div className="grid g4 steps">{steps.map(([t, d]) => <div key={t} className="card step-card"><h3>{t}</h3><p className="small muted" style={{ margin: 0 }}>{d}</p></div>)}</div>
      </div>
    </section>
  );
}

export function CtaBand() {
  const { user } = useAuth();
  return (
    <section className="section">
      <div className="container">
        <div className="card hero-card center" style={{ padding: '2.2rem 1.2rem' }}>
          <h2 style={{ color: '#fff' }}>আজই প্রস্তুতির পরিকল্পনা শুরু করুন</h2>
          <p className="muted">একটা ডায়াগনস্টিক টেস্ট দিন — কোথায় দাঁড়িয়ে আছেন, প্রথম দিনেই জানবেন।</p>
          <Link className="btn accent lg" to={user ? '/app' : '/register'}>{user ? 'ড্যাশবোর্ডে যান' : 'ফ্রি অ্যাকাউন্ট খুলুন'}</Link>
        </div>
      </div>
    </section>
  );
}

// ---------- Features ----------
export function Features() {
  const { user } = useAuth();
  return (
    <PublicLayout>
      <PageHero kicker="ফিচার" title="প্রস্তুতির প্রতিটি ধাপে যা লাগে" sub="অনুশীলন থেকে মডেল টেস্ট, ভুল বিশ্লেষণ থেকে রিভিশন — সব এক জায়গায়, আপনার ডেটা দিয়ে চালিত।" />
      <section className="section">
        <div className="container grid g3">
          {ALL_FEATURES.map((f) => (
            <Link key={f.t} to={user ? f.to : '/register'} className="card feature post-card">
              <div className="fi">{f.i}</div><h3>{f.t}</h3><p className="muted small" style={{ margin: 0 }}>{f.d}</p>
            </Link>
          ))}
        </div>
      </section>
      <CtaBand />
    </PublicLayout>
  );
}

// ---------- Packages ----------
export function PackageGrid() {
  const { user } = useAuth();
  const { data: billing } = useFetch('/billing/plans');
  const trial = bn(billing?.trial_days ?? 7);
  return (
    <div className="grid g3">
      <div className="card">
        <span className="badge gray">সবসময় ফ্রি</span>
        <h3 className="mt">ফ্রি প্ল্যান</h3>
        <div className="price" style={{ fontSize: '1.7rem', fontWeight: 700 }}>৳০</div>
        <ul className="small" style={{ paddingLeft: '1.1rem' }}>{FREE_FEATURES.map((l) => <li key={l}>{l}</li>)}</ul>
        <Link to={user ? '/app' : '/register'} className="btn block ghost">{user ? 'ড্যাশবোর্ড' : `${trial} দিনের ট্রায়ালসহ শুরু করুন`}</Link>
      </div>
      {billing?.plans.map((p) => (
        <div key={p.code} className="card" style={p.highlight ? { borderColor: 'var(--brand)', borderWidth: 2 } : undefined}>
          {p.highlight ? <span className="badge accent">{p.highlight}</span> : <span className="badge">এক্সাম পাস</span>}
          <h3 className="mt"><Link to={`/packages/${p.code}`} style={{ color: 'inherit' }}>{p.name_bn}</Link></h3>
          <div style={{ fontSize: '1.7rem', fontWeight: 700 }}>৳{bn(p.price_bdt)}</div>
          <div className="tiny muted mb">মেয়াদ {bn(p.duration_days)} দিন · কোনো অটো-রিনিউ নেই</div>
          <ul className="small" style={{ paddingLeft: '1.1rem' }}>{PRO_FEATURES.map((l) => <li key={l}>{l}</li>)}{!p.includes_ai_coach && <li className="muted">এআই কোচ সীমিত</li>}</ul>
          <Link to={user ? '/app/billing' : '/register'} className="btn block">{user ? 'এখনই নিন' : 'রেজিস্ট্রেশন করে নিন'}</Link>
        </div>
      ))}
    </div>
  );
}

export function Packages() {
  return (
    <PublicLayout>
      <PageHero kicker="প্যাকেজ" title="আপনার প্রয়োজন অনুযায়ী প্যাকেজ" sub="অনুশীলন, লাইভ এক্সাম আর ব্যাখ্যা সবসময় ফ্রি। ব্যক্তিগত বিশ্লেষণ আর সীমাহীন টেস্টের জন্য এক্সাম পাস — bKash, Nagad বা Rocket-এ।" />
      <section className="section"><div className="container"><PackageGrid /><p className="center tiny muted mt">পেমেন্ট ও রিফান্ডের নিয়ম: <Link to="/terms">শর্তাবলি</Link> · প্রশ্ন থাকলে <Link to="/faq">প্রশ্নোত্তর</Link> দেখুন।</p></div></section>
    </PublicLayout>
  );
}

// ---------- People ----------
export function PeopleGrid({ kind, limit }) {
  const { data, error } = useFetch(`/site/people?kind=${kind}`);
  if (error) return null;
  if (!data) return <Loader />;
  const rows = limit ? data.slice(0, limit) : data;
  if (!rows.length) return null;
  return (
    <div className="grid g4">
      {rows.map((p) => (
        <div key={p.id} className="card person">
          <Initial p={p} />
          <b>{p.name}</b>
          {p.role_line && <div className="small muted">{p.role_line}</div>}
          {p.exam_tag && <span className="badge mt">{p.exam_tag}</span>}
          {p.bio && <p className="small" style={{ marginBottom: 0 }}>{p.bio}</p>}
        </div>
      ))}
    </div>
  );
}

export function Mentors() {
  const { data } = useFetch('/site/people');
  const has = (k) => data?.some((p) => p.kind === k);
  return (
    <PublicLayout>
      <PageHero kicker="মেন্টর ও উপদেষ্টা" title="যাঁরা প্রশ্ন ও কনটেন্টের মান দেখেন" sub="প্রশ্ন যাচাই, ব্যাখ্যা লেখা, ভুল রিপোর্টের সমাধান আর প্রস্তুতির গাইড — এই কাজগুলো যাঁরা করেন।" />
      <section className="section"><div className="container stack">
        {!data ? <Loader /> : !has('advisor') && !has('mentor') ? <div className="card"><Empty icon="👩‍🏫" title="মেন্টর প্রোফাইল শীঘ্রই যুক্ত হবে" /></div> : <>
          {has('advisor') && <><h2>উপদেষ্টা</h2><PeopleGrid kind="advisor" /></>}
          {has('mentor') && <><h2 className="mt2">মেন্টর ও প্রশিক্ষক</h2><PeopleGrid kind="mentor" /></>}
        </>}
        <div className="center mt"><Link to="/ask" className="btn">মেন্টরকে প্রশ্ন করুন</Link></div>
      </div></section>
    </PublicLayout>
  );
}

export function HallOfFame() {
  const { data } = useFetch('/site/people?kind=story');
  return (
    <PublicLayout>
      <PageHero kicker="সফলতার গল্প" title="শিক্ষার্থীদের নিজের কথা" sub="আরোহণ দিয়ে প্রস্তুতি নিয়েছেন যাঁরা — তাঁদের অভিজ্ঞতা, তাঁদের ভাষায়।" />
      <section className="section"><div className="container">
        {!data ? <Loader /> : !data.length ? <div className="card"><Empty icon="🏅" title="প্রথম গল্পটা আপনারই হতে পারে" /></div> : (
          <div className="grid g3">{data.map((p) => (
            <div key={p.id} className="card">
              <div className="row"><Initial p={p} /><div><b>{p.name}</b><div className="small muted">{p.role_line}</div>{p.exam_tag && <span className="badge">{p.exam_tag}</span>}</div></div>
              {p.bio && <p className="small" style={{ whiteSpace: 'pre-wrap' }}>“{p.bio}”</p>}
            </div>
          ))}</div>
        )}
        <div className="card" style={{ maxWidth: 760, margin: '2rem auto 0' }}>
          <h3>🏅 আপনার সফলতার গল্প শেয়ার করুন</h3>
          <p className="small muted">আরোহণে প্রস্তুতি নিয়ে সফল হয়েছেন? আপনার অভিজ্ঞতা পরের প্রার্থীদের পথ দেখাবে।</p>
          <MessageForm kind="story" />
        </div>
      </div></section>
    </PublicLayout>
  );
}

// ---------- FAQ ----------
export function FaqList({ limit, q = '' }) {
  const { data, error } = useFetch('/site/faqs');
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loader />;
  if (!data.length) return <Empty icon="❔" title="এখনো কোনো প্রশ্নোত্তর যোগ হয়নি" />;
  const needle = q.trim().toLowerCase();
  const matched = needle ? data.filter((f) => `${f.question} ${f.answer} ${f.category}`.toLowerCase().includes(needle)) : data;
  if (!matched.length) return <Empty icon="🔍" title="মিল পাওয়া যায়নি">অন্য শব্দে খুঁজুন, অথবা <Link to="/ask">মেন্টরকে প্রশ্ন করুন</Link>।</Empty>;
  const rows = limit ? matched.slice(0, limit) : matched;
  const cats = [...new Set(rows.map((f) => f.category))];
  return cats.map((c) => (
    <div key={c} className="mb">
      {!limit && cats.length > 1 && <h3 className="mt">{c}</h3>}
      {rows.filter((f) => f.category === c).map((f) => <details key={f.id} className="faq-item"><summary>{f.question}</summary><p>{f.answer}</p></details>)}
    </div>
  ));
}

export function Faq() {
  const [q, setQ] = useState('');
  return (
    <PublicLayout>
      <PageHero kicker="প্রশ্নোত্তর" title="সাধারণ জিজ্ঞাসা" sub="প্যাকেজ, পেমেন্ট, পরীক্ষা ও অ্যাকাউন্ট নিয়ে যা সবাই জানতে চান।" />
      <section className="section"><div className="container" style={{ maxWidth: 860 }}>
        <input className="input mb" placeholder="প্রশ্নোত্তরে খুঁজুন (যেমন: পেমেন্ট, ট্রায়াল, লাইভ পরীক্ষা)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="প্রশ্নোত্তরে খুঁজুন" />
        <div className="card"><FaqList q={q} /></div>
        <p className="center small muted mt">উত্তর পাননি? <Link to="/contact">যোগাযোগ করুন</Link> বা <Link to="/ask">মেন্টরকে প্রশ্ন করুন</Link>।</p>
      </div></section>
    </PublicLayout>
  );
}

// ---------- Posts ----------
const deadlineInfo = (d) => {
  if (!d) return null;
  const days = Math.ceil((new Date(`${String(d).slice(0, 10)}T23:59:59+06:00`) - Date.now()) / 864e5);
  return days < 0 ? ['bad', 'আবেদন শেষ'] : days === 0 ? ['bad', 'আজ শেষ দিন'] : days <= 3 ? ['mid', `${bn(days)} দিন বাকি`] : ['good', `শেষ তারিখ ${fmtDate(d)}`];
};

export function PostCard({ p }) {
  const t = POST_TYPES[p.type];
  const dl = p.type === 'circular' ? deadlineInfo(p.deadline) : null;
  return (
    <Link to={`${t.path}/${p.slug}`} className="card post-card">
      {p.cover_url && <img src={p.cover_url} alt="" loading="lazy" />}
      <div className="row between tiny">{p.category ? <span className="badge">{p.category}</span> : <span />}<span className="muted">{fmtDate(p.published_at)}</span></div>
      <b>{p.title}</b>
      {p.organization && <span className="small muted">🏢 {p.organization}</span>}
      {p.excerpt && <span className="small muted">{p.excerpt}</span>}
      {dl && <span className={`deadline tone-${dl[0]}`}>⏰ {dl[1]}</span>}
    </Link>
  );
}

export function PostList({ type }) {
  const t = POST_TYPES[type];
  const [params, setParams] = useSearchParams();
  const category = params.get('category') || '';
  const page = Number(params.get('page')) || 1;
  const [q, setQ] = useState(params.get('q') || '');
  const qs = new URLSearchParams({ type, page: String(page), ...(category && { category }), ...(params.get('q') && { q: params.get('q') }) });
  const { data, error, loading } = useFetch(`/site/posts?${qs}`, [type]);
  const set = (k, v) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); if (k !== 'page') n.delete('page'); setParams(n); };
  return (
    <PublicLayout>
      <PageHero kicker={`${t.icon} তথ্যকেন্দ্র`} title={t.title} sub={t.sub}>
        <form className="row mt" style={{ maxWidth: 520 }} onSubmit={(e) => { e.preventDefault(); set('q', q.trim()); }}>
          <input className="input" style={{ flex: 1, minWidth: 0 }} placeholder="খুঁজুন…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="খুঁজুন" /><button className="btn accent" style={{ flexShrink: 0 }}>খুঁজুন</button>
        </form>
      </PageHero>
      <section className="section"><div className="container stack">
        {data?.categories.length > 0 && (
          <div className="chips"><button className={`chip ${!category ? 'active' : ''}`} onClick={() => set('category', '')}>সব</button>
            {data.categories.map((c) => <button key={c} className={`chip ${category === c ? 'active' : ''}`} onClick={() => set('category', c)}>{c}</button>)}</div>
        )}
        {loading && !data ? <Loader /> : error ? <ErrorBox error={error} /> : !data.rows.length ? <div className="card"><Empty title="এখানে এখনো কিছু নেই" /></div> : (
          <div className="grid g3">{data.rows.map((p) => <PostCard key={p.id} p={p} />)}</div>
        )}
        {data?.pages > 1 && (
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn light sm" disabled={page <= 1} onClick={() => set('page', String(page - 1))}>← আগের</button>
            <span className="small">{bn(page)} / {bn(data.pages)}</span>
            <button className="btn light sm" disabled={page >= data.pages} onClick={() => set('page', String(page + 1))}>পরের →</button>
          </div>
        )}
      </div></section>
    </PublicLayout>
  );
}

export function PostDetail({ type }) {
  const { slug } = useParams();
  const t = POST_TYPES[type];
  const { data, error, loading } = useFetch(`/site/posts/${type}/${encodeURIComponent(slug)}`, [slug]);
  const p = data?.post;
  const dl = p?.type === 'circular' ? deadlineInfo(p.deadline) : null;
  return (
    <PublicLayout>
      <section className="section"><div className="container" style={{ maxWidth: 860 }}>
        <Link to={t.path} className="small">← {t.title}</Link>
        {loading ? <Loader /> : error ? <ErrorBox error={error} /> : <>
          <article className="card mt">
            <div className="row tiny">{p.category && <span className="badge">{p.category}</span>}<span className="muted">{fmtDate(p.published_at)} · {bn(p.views)} বার দেখা হয়েছে</span></div>
            <h1 className="mt" style={{ marginTop: '.6rem' }}>{p.title}</h1>
            {p.organization && <div className="small muted">🏢 {p.organization}</div>}
            {dl && <div className={`deadline tone-${dl[0]} mt`}>⏰ {dl[1]}</div>}
            {p.cover_url && <img src={p.cover_url} alt="" style={{ width: '100%', borderRadius: 12, margin: '1rem 0' }} />}
            {p.excerpt && <p className="muted"><b>{p.excerpt}</b></p>}
            {p.body && <div className="post-body">{p.body}</div>}
            {p.link_url && <a className="btn mt" href={p.link_url} target="_blank" rel="noopener noreferrer">{type === 'circular' ? 'মূল বিজ্ঞপ্তি / আবেদন' : type === 'resource' ? 'ডাউনলোড / খুলুন' : 'বিস্তারিত'} ↗</a>}
          </article>
          {data.related.length > 0 && <><h3 className="mt2">আরও দেখুন</h3><div className="grid g2">{data.related.map((r) => <PostCard key={r.id} p={r} />)}</div></>}
        </>}
      </div></section>
    </PublicLayout>
  );
}

// ---------- Forms ----------
const MSG_COPY = {
  contact: { subject: 'বিষয়', message: 'বার্তা', done: 'শীঘ্রই আমরা যোগাযোগ করব' },
  question: { subject: 'সংক্ষেপে প্রশ্নটি (যেমন: গণিতে কীভাবে গতি বাড়াব?)', message: 'বিস্তারিত লিখুন', done: 'মেন্টরের উত্তর এই পাতায় ও আপনার দেওয়া যোগাযোগে জানানো হবে' },
  story: { subject: 'কোন পরীক্ষায় সফল হয়েছেন (যেমন: ৪৫তম বিসিএস, প্রশাসন)', message: 'আপনার প্রস্তুতির গল্প — কী কাজে লেগেছে, অন্যদের কী পরামর্শ দেবেন', done: 'ধন্যবাদ! যাচাইয়ের পর আপনার অনুমতি নিয়ে গল্পটি প্রকাশ করা হবে' },
  partnership: { subject: 'প্রতিষ্ঠান / ইভেন্টের নাম', message: 'কী ধরনের পার্টনারশিপ, কবে, কতজন অংশ নেবেন, কী সহযোগিতা চান', done: 'আমাদের পার্টনারশিপ টিম শীঘ্রই যোগাযোগ করবে' },
};

export function MessageForm({ kind, topics }) {
  const { user } = useAuth();
  const copy = MSG_COPY[kind];
  const [f, setF] = useState({ name: user?.name || '', contact: user?.phone || user?.email || '', subject: '', topic: topics?.[0] || '', message: '' });
  const [state, setState] = useState(null);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr(null); setState('busy');
    try { await api.post('/site/contact', { ...f, kind }); setState('ok'); setF({ ...f, subject: '', message: '' }); } catch (e2) { setErr(e2.message); setState(null); }
  };
  if (state === 'ok') return <div className="alert good">✓ পাঠানো হয়েছে। {copy.done}। <button className="btn light sm" onClick={() => setState(null)}>আরেকটি পাঠান</button></div>;
  return (
    <form onSubmit={submit}>
      <ErrorBox error={err} />
      <div className="grid g2">
        <div className="field"><label htmlFor="mf-n">নাম</label><input id="mf-n" className="input" required value={f.name} onChange={set('name')} /></div>
        <div className="field"><label htmlFor="mf-c">মোবাইল বা ইমেইল</label><input id="mf-c" className="input" required value={f.contact} onChange={set('contact')} /></div>
      </div>
      {topics && <div className="field"><label htmlFor="mf-t">ধরন</label><select id="mf-t" className="input" value={f.topic} onChange={set('topic')}>{topics.map((t) => <option key={t}>{t}</option>)}</select></div>}
      <div className="field"><label htmlFor="mf-s">{copy.subject}</label><input id="mf-s" className="input" required={kind !== 'contact'} value={f.subject} onChange={set('subject')} /></div>
      <div className="field"><label htmlFor="mf-m">{copy.message}</label><textarea id="mf-m" className="input" rows={6} required value={f.message} onChange={set('message')} /></div>
      <button className="btn" disabled={state === 'busy'}>{state === 'busy' ? 'পাঠানো হচ্ছে…' : 'পাঠান'}</button>
    </form>
  );
}

const QUESTION_TOPICS = ['বিসিএস', 'ব্যাংক', 'প্রাইমারি', 'NTRCA', 'ভর্তি', 'একাডেমিক', 'প্রস্তুতির কৌশল', 'অ্যাপ ও অ্যাকাউন্ট'];

export function Ask() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const topic = params.get('topic') || '';
  const qs = new URLSearchParams({ ...(params.get('q') && { q: params.get('q') }), ...(topic && { topic }) });
  const { data: pub } = useFetch(`/site/questions?${qs}`);
  const { data: mine } = useFetch(user ? '/site/my-questions' : null);
  const set = (k, v) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n); };
  return (
    <PublicLayout>
      <PageHero kicker="মেন্টরকে প্রশ্ন" title="প্রস্তুতি নিয়ে প্রশ্ন আছে?" sub="আগে খুঁজে দেখুন — অন্য কেউ হয়তো একই প্রশ্ন করেছেন। না পেলে লিখে পাঠান, মেন্টর উত্তর দেবেন।">
        <form className="row mt" style={{ maxWidth: 560 }} onSubmit={(e) => { e.preventDefault(); set('q', q.trim()); }}>
          <input className="input" style={{ flex: 1, minWidth: 0 }} placeholder="প্রশ্ন বা বিষয় খুঁজুন…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="প্রশ্ন খুঁজুন" />
          <button className="btn accent" style={{ flexShrink: 0 }}>খুঁজুন</button>
        </form>
      </PageHero>
      <section className="section"><div className="container grid g-main">
        <div className="stack">
          {pub?.topics.length > 0 && (
            <div className="chips"><button className={`chip ${!topic ? 'active' : ''}`} onClick={() => set('topic', '')}>সব</button>
              {pub.topics.map((t) => <button key={t} className={`chip ${topic === t ? 'active' : ''}`} onClick={() => set('topic', t)}>{t}</button>)}</div>
          )}
          {!pub ? <Loader /> : !pub.rows.length
            ? <div className="card"><Empty icon="💬" title={params.get('q') || topic ? 'মিল পাওয়া যায়নি' : 'এখনো কোনো উত্তর প্রকাশিত হয়নি'}>পাশের ফর্মে আপনার প্রশ্ন পাঠান।</Empty></div>
            : pub.rows.map((m) => (
              <details key={m.id} className="card faq-item" style={{ borderBottom: 0 }}>
                <summary>{m.subject || m.message.slice(0, 120)}</summary>
                {m.topic && <span className="badge gray">{m.topic}</span>}
                {m.subject && <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{m.message}</p>}
                <div className="explain small"><b>মেন্টরের উত্তর:</b> <span style={{ whiteSpace: 'pre-wrap' }}>{m.reply}</span></div>
              </details>
            ))}
        </div>
        <div className="stack">
          <div className="card"><h3>✍️ নতুন প্রশ্ন</h3><MessageForm kind="question" topics={QUESTION_TOPICS} /></div>
          <div className="card">
            <h3>আমার প্রশ্ন</h3>
            {!user ? <p className="small muted"><Link to="/login">লগইন করে</Link> প্রশ্ন পাঠালে উত্তর এখানেও দেখতে পাবেন।</p>
              : !mine?.length ? <p className="small muted">এখনো কোনো প্রশ্ন পাঠাননি।</p>
              : mine.map((m) => (
                <div key={m.id} style={{ padding: '.5rem 0', borderBottom: '1px dashed var(--line)' }}>
                  <div className="row between tiny"><b>{m.subject || 'প্রশ্ন'}</b><span className={`badge ${m.status === 'answered' ? 'good' : 'gray'}`}>{m.status === 'answered' ? 'উত্তর দেওয়া হয়েছে' : m.status === 'closed' ? 'বন্ধ' : 'অপেক্ষমাণ'}</span></div>
                  <div className="small">{m.message}</div>
                  {m.reply && <div className="explain small mt"><b>উত্তর:</b> {m.reply}</div>}
                </div>
              ))}
          </div>
        </div>
      </div></section>
    </PublicLayout>
  );
}

// Set these at build time (client/.env) — rows without a value are hidden.
const ENV = import.meta.env;
const CONTACT = [
  ['📞', 'হটলাইন', ENV.VITE_CONTACT_PHONE, ENV.VITE_CONTACT_PHONE && `tel:${ENV.VITE_CONTACT_PHONE}`],
  ['✉️', 'ইমেইল', ENV.VITE_CONTACT_EMAIL, ENV.VITE_CONTACT_EMAIL && `mailto:${ENV.VITE_CONTACT_EMAIL}`],
  ['📍', 'অফিস', ENV.VITE_CONTACT_ADDRESS, null],
];

export function Contact() {
  return (
    <PublicLayout>
      <PageHero kicker="যোগাযোগ" title="আমাদের সাথে কথা বলুন" sub="পেমেন্ট, অ্যাকাউন্ট, প্রশ্নের ভুল বা যেকোনো পরামর্শ — লিখে জানান।" />
      <section className="section"><div className="container grid g-main">
        <div className="card"><MessageForm kind="contact" topics={['সাধারণ জিজ্ঞাসা', 'পেমেন্ট ও প্যাকেজ', 'অ্যাকাউন্ট ও লগইন', 'প্রশ্নে ভুল', 'পরামর্শ', 'অন্যান্য']} /></div>
        <div className="card">
          {CONTACT.some((c) => c[2]) && <div className="mb">{CONTACT.filter((c) => c[2]).map(([ico, label, value, href]) => (
            <div key={label} className="row" style={{ padding: '.4rem 0' }}><span style={{ fontSize: '1.3rem' }}>{ico}</span><span><span className="tiny muted">{label}</span><br />{href ? <a href={href}>{value}</a> : <b className="small">{value}</b>}</span></div>
          ))}</div>}
          <h3>দ্রুত সমাধান</h3>
          <p className="small">• পেমেন্ট সমস্যা: অ্যাপের <b>প্ল্যান ও পেমেন্ট</b> পাতায় লেনদেনের অবস্থা দেখুন।</p>
          <p className="small">• প্রশ্নে ভুল: প্রশ্নের পাশে <b>⚠ রিপোর্ট</b> চাপুন — বিশেষজ্ঞ যাচাই করবেন।</p>
          <p className="small">• পাসওয়ার্ড ভুলে গেছেন: <Link to="/forgot">পাসওয়ার্ড রিসেট</Link>।</p>
          <p className="small">• সাধারণ জিজ্ঞাসা: <Link to="/faq">প্রশ্নোত্তর</Link>।</p>
        </div>
      </div></section>
    </PublicLayout>
  );
}

const REFERRAL_FAQ = [
  ['কতজনকে আমন্ত্রণ জানাতে পারব?', 'যতজন খুশি। প্রত্যেক বন্ধু প্রথম পূর্ণ টেস্ট শেষ করলে আলাদাভাবে ৭ দিন যোগ হবে।'],
  ['বোনাস কখন যোগ হয়?', 'বন্ধু আপনার লিংক দিয়ে রেজিস্ট্রেশন করে ১০ বা তার বেশি প্রশ্নের একটি টেস্ট জমা দিলেই স্বয়ংক্রিয়ভাবে।'],
  ['কতজন যোগ দিয়েছে কোথায় দেখব?', 'অ্যাপের আমন্ত্রণ অংশে — কতজন যোগ দিয়েছে আর কতবার বোনাস পেয়েছেন।'],
];

export function Referral() {
  const { user } = useAuth();
  return (
    <PublicLayout>
      <PageHero kicker="রেফারেল প্রোগ্রাম" title="বন্ধুকে আনুন, দুজনেই পান বাড়তি সময়" sub="আপনার লিংকে যোগ দিলে বন্ধু পাবে ৭ দিনের বাড়তি ট্রায়াল। বন্ধু প্রথম পূর্ণ টেস্ট (১০+ প্রশ্ন) শেষ করলে আপনি পাবেন ৭ দিনের এক্সাম পাস।" />
      <section className="section"><div className="container grid g3 steps">
        {[['লিংক নিন', 'প্রোফাইল পাতা থেকে আপনার রেফারেল লিংক কপি করুন।'], ['শেয়ার করুন', 'বন্ধুকে লিংক পাঠান — সে লিংক দিয়ে রেজিস্ট্রেশন করবে।'], ['বোনাস পান', 'বন্ধু প্রথম টেস্ট শেষ করলেই আপনার অ্যাকাউন্টে ৭ দিন যোগ হবে।']].map(([t, d]) => (
          <div key={t} className="card step-card"><h3>{t}</h3><p className="small muted" style={{ margin: 0 }}>{d}</p></div>
        ))}
      </div>
      <div className="center mt2"><Link className="btn accent lg" to={user ? '/app/profile' : '/register'}>{user ? 'আমার রেফারেল লিংক' : 'অ্যাকাউন্ট খুলে লিংক নিন'}</Link></div>
      <div className="container mt2" style={{ maxWidth: 860 }}><div className="card">
        <h3>রেফারেল নিয়ে প্রশ্ন</h3>
        {REFERRAL_FAQ.map(([qq, aa]) => <details key={qq} className="faq-item"><summary>{qq}</summary><p>{aa}</p></details>)}
      </div></div></section>
    </PublicLayout>
  );
}

export function Search() {
  const [params] = useSearchParams();
  const q = params.get('q') || '';
  const { data, loading } = useFetch(q ? `/site/search?q=${encodeURIComponent(q)}` : null, [q]);
  return (
    <PublicLayout>
      <PageHero kicker="অনুসন্ধান" title={q ? `"${q}" — ফলাফল` : 'খুঁজুন'} />
      <section className="section"><div className="container stack">
        {loading ? <Loader /> : !data ? null : !data.posts.length && !data.exams.length ? <div className="card"><Empty title="কিছু পাওয়া যায়নি" /></div> : <>
          {data.exams.length > 0 && <><h3>পরীক্ষা</h3><div className="grid g3">{data.exams.map((e) => (
            <Link key={e.id} to="/register" className="exam-tile"><b>{e.name_bn}</b><span className="small muted">{TRACKS[e.track]?.bn} · {e.description}</span></Link>
          ))}</div></>}
          {data.posts.length > 0 && <><h3 className="mt">লেখা ও বিজ্ঞপ্তি</h3><div className="grid g3">{data.posts.map((p) => <PostCard key={p.id} p={p} />)}</div></>}
        </>}
      </div></section>
    </PublicLayout>
  );
}

export function Privacy() {
  return (
    <PublicLayout>
      <PageHero kicker="প্রাইভেসি" title="প্রাইভেসি পলিসি" sub="আপনার কোন তথ্য আমরা রাখি, কেন রাখি, আর কীভাবে সুরক্ষিত রাখি।" />
      <section className="section"><div className="container" style={{ maxWidth: 860 }}><div className="card post-body">
{`যা সংগ্রহ করি
• অ্যাকাউন্টের তথ্য: নাম, মোবাইল/ইমেইল, লক্ষ্য পরীক্ষা, জেলা ও প্রতিষ্ঠান (ঐচ্ছিক)।
• প্রস্তুতির ডেটা: আপনার দেওয়া উত্তর, সময়, ভুলের ধরন — আপনার ব্যক্তিগত বিশ্লেষণ তৈরির জন্য।
• পেমেন্টের তথ্য: প্যাকেজ, পরিমাণ ও লেনদেন নম্বর। আপনার bKash/Nagad পিন আমরা কখনো দেখি বা রাখি না।

যেভাবে ব্যবহার করি
• আপনার রেডিনেস স্কোর, আজকের মিশন, রিভিশন ও কোচের পরামর্শ তৈরি করতে।
• মেধাতালিকায় নাম দেখানো ঐচ্ছিক — প্রোফাইল থেকে বন্ধ করতে পারেন।
• আপনার ব্যক্তিগত তথ্য আমরা বিক্রি করি না।

আপনার নিয়ন্ত্রণ
• প্রোফাইল থেকে তথ্য পরিবর্তন করতে পারেন।
• অ্যাকাউন্ট মুছতে চাইলে যোগাযোগ পাতায় লিখুন।`}
      </div></div></section>
    </PublicLayout>
  );
}
