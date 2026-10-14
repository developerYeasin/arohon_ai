import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useFetch } from '../components/ui.jsx';
import { bn, TRACKS } from '../utils.js';
import PublicLayout from '../components/PublicLayout.jsx';
import { HowItWorks, CtaBand, PackageGrid, PeopleGrid, FaqList, PostCard } from './Site.jsx';

const FEATURES = [
  { i: '🎯', t: 'এক্সাম রেডিনেস স্কোর', d: 'শুধু "৭২/১০০" নয় — বিষয়ভিত্তিক প্রস্তুতি, গতি, নির্ভুলতা, ধারাবাহিকতা, আনুমানিক প্রাপ্ত নম্বর ও সবচেয়ে বড় ঝুঁকি।' },
  { i: '🧠', t: 'মিসটেক ইন্টেলিজেন্স', d: 'প্রতিটি ভুলের কারণ চিহ্নিত হয় — জানা ছিল না, ভুলে গেছি, অসাবধানতা, সময়ের চাপ, আন্দাজ — আর প্রতিটির আলাদা সমাধান।' },
  { i: '⚡', t: 'অ্যাডাপটিভ টেস্ট', d: 'আপনার দুর্বল টপিক, পরীক্ষায় গুরুত্ব ও বর্তমান লেভেল দেখে প্রশ্ন বাছাই — দুজন শিক্ষার্থী একই সেট পায় না।' },
  { i: '🔁', t: 'স্মার্ট রিভিশন', d: '"৫০০ প্রশ্ন" নয় — "আজ এই ২৭টি প্রশ্ন রিভিশন দিলে সবচেয়ে বেশি লাভ।" ১-৩-৭-১৬ দিনের স্পেসড রিপিটিশন।' },
  { i: '🏛️', t: 'আসল পরীক্ষার হল', d: 'বাস্তব সময়, নেগেটিভ মার্কিং, OMR শিট, বিরতিহীন মোড — আর শেষে শুধু স্কোর নয়, পূর্ণ ডায়াগনস্টিক রিপোর্ট।' },
  { i: '🤖', t: 'পার্সোনাল এআই কোচ', d: '"আজ কী পড়ব?", "কেন নম্বর হারাচ্ছি?", "১০ দিন বাকি, কী বাদ দেব?" — আপনার নিজের ডেটা থেকে উত্তর।' },
];

const COMPARE = [
  ['কী পড়ব', 'হাজার প্রশ্নের তালিকা', 'আজকের মিশন: আপনার জন্য বাছাই করা ৫৮ মিনিট'],
  ['পরীক্ষার পর', 'স্কোর ও মেধাক্রম', 'কেন নম্বর হারালেন: গতি, অসাবধানতা, নাকি জ্ঞান'],
  ['ভুল প্রশ্ন', '"Wrong Questions" ফোল্ডার', 'ভুলের ধরন অনুযায়ী আলাদা চিকিৎসা ও রি-টেস্ট'],
  ['উন্নতি হচ্ছে কি না', 'অনুমান', 'সাপ্তাহিক নির্ভুলতার প্রবণতা ও রেডিনেস স্কোর'],
  ['প্রশ্নের মান', 'ভুল প্রশ্ন থেকেই যায়', 'রিপোর্ট → বিশেষজ্ঞ যাচাই → সংশোধনের ইতিহাস'],
];

const PROMISES = [
  'প্রতিদিন আপনি জানবেন ঠিক কী পড়তে হবে — এবং কেন।',
  'প্রতিটি পরীক্ষার পর জানবেন নম্বর কোথায় হারিয়েছেন।',
  'যে প্রশ্ন একবার ভুল করেছেন, তা আয়ত্তে না আসা পর্যন্ত ফিরে আসবে।',
  'আপনার র‍্যাংক ও স্কোর বাস্তব — কোনো ভুয়া পরিসংখ্যান বা "নিশ্চিত চাকরি"র প্রতিশ্রুতি নেই।',
  'একাডেমিক থেকে ভর্তি, ভর্তি থেকে চাকরি — একই অ্যাকাউন্টে পুরো যাত্রা।',
];

export default function Landing() {
  const { user } = useAuth();
  const { data: exams } = useFetch('/catalog/exams');
  const { data: stats } = useFetch('/catalog/stats');
  const { data: circulars } = useFetch('/site/posts?type=circular&limit=6');
  const { data: guides } = useFetch('/site/posts?type=blog&limit=3');
  const { data: people } = useFetch('/site/people');
  const home = ['admin', 'teacher'].includes(user?.role) ? '/admin' : '/app';
  const cta = user ? home : '/register';

  return (
    <PublicLayout>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="kicker">একাডেমিক · ভর্তি · চাকরি — এক প্ল্যাটফর্মে</span>
            <h1>প্রশ্নব্যাংক নয়,<br /><span className="hl">আপনার ব্যক্তিগত পরীক্ষা-প্রস্তুতি সিস্টেম</span></h1>
            <p className="lead">আরোহণ জানে আপনি কোন টপিকে দুর্বল, কেন নম্বর হারাচ্ছেন, আর আজ ঠিক কী পড়লে সবচেয়ে বেশি লাভ — বিসিএস, ব্যাংক, প্রাইমারি, NTRCA, ঢাবি-মেডিকেল-গুচ্ছ ভর্তি এবং এসএসসি-এইচএসসির জন্য।</p>
            <div className="row mt">
              <Link className="btn accent lg" to={cta}>ডায়াগনস্টিক টেস্ট দিন — ফ্রি</Link>
              <Link className="btn ghost lg" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.35)' }} to="/demo-exam">লগইন ছাড়া ডেমো পরীক্ষা</Link>
            </div>
          </div>
          <div className="hero-mock" aria-label="রেডিনেস রিপোর্টের উদাহরণ">
            <div className="row between"><b>বিসিএস প্রিলি রেডিনেস</b><span className="badge accent">উদাহরণ</span></div>
            <div style={{ fontSize: '2.6rem', fontWeight: 700, margin: '.3rem 0' }}>৭১%</div>
            {[['বাংলা', 82, '#22c55e'], ['ইংরেজি', 75, '#22c55e'], ['গণিত', 51, '#f59e0b'], ['বাংলাদেশ বিষয়াবলি', 74, '#22c55e'], ['আন্তর্জাতিক', 68, '#f59e0b']].map(([n, v, c]) => (
              <div key={n} style={{ marginBottom: '.45rem' }}>
                <div className="row between small"><span>{n}</span><span>{bn(v)}%</span></div>
                <div className="bar"><span style={{ width: `${v}%`, background: c }} /></div>
              </div>
            ))}
            <div className="small mt" style={{ color: '#fcd34d' }}>⚠ সবচেয়ে বড় ঝুঁকি: সময়ের চাপে গতি কম</div>
            <div className="small" style={{ color: '#c9cdf0' }}>→ পরামর্শ: গণিত (বীজগণিত) — ৩ দিনের রিকভারি প্ল্যান</div>
            {circulars?.rows.length > 0 && <div className="ticker mt">
              <div className="row between"><b className="small">📢 সাম্প্রতিক সার্কুলার</b><Link to="/circulars" className="tiny" style={{ color: '#fcd34d' }}>সব দেখুন →</Link></div>
              {circulars.rows.map((c) => <Link key={c.id} to={`/circulars/${c.slug}`}>{c.title}</Link>)}
            </div>}
          </div>
        </div>
        <div className="container">
          <div className="stats-strip">
            <div><b>{bn(stats?.exams ?? 9)}টি</b><span>লক্ষ্য পরীক্ষা</span></div>
            <div><b>৩টি</b><span>ট্র্যাক: একাডেমিক, ভর্তি, চাকরি</span></div>
            <div><b>{bn(stats?.questions ?? '—')}</b><span>যাচাইকৃত প্রশ্ন</span></div>
            <div><b>৯ ধরনের</b><span>ভুল বিশ্লেষণ</span></div>
          </div>
        </div>
      </section>

      <section className="section" id="tracks">
        <div className="container">
          <h2>আপনার লক্ষ্য বেছে নিন</h2>
          <p className="sub">প্রতিটি পরীক্ষার নিজস্ব সিলেবাস, নম্বর বণ্টন, নেগেটিভ মার্কিং ও সময় অনুযায়ী আলাদা ড্যাশবোর্ড।</p>
          {['job', 'admission', 'academic'].map((t) => (
            <div key={t} className="mb">
              <h3>{TRACKS[t].icon} {TRACKS[t].bn} <span className="muted small" style={{ fontWeight: 400 }}>— {TRACKS[t].desc}</span></h3>
              <div className="grid g4">
                {exams?.filter((e) => e.track === t).map((e) => (
                  <Link key={e.id} to={`/exams/${e.code}`} className="exam-tile">
                    <span className="dot" style={{ background: e.color || 'var(--brand)' }}>{e.name_bn.slice(0, 1)}</span>
                    <b>{e.name_bn}</b>
                    <span className="small muted">{e.description}</span>
                    <span className="tiny muted">{bn(e.total_questions)} প্রশ্ন · {bn(e.duration_min)} মিনিট · নেগেটিভ {Number(e.negative_mark) ? bn(Number(e.negative_mark)) : 'নেই'}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section alt" id="features">
        <div className="container">
          <h2>যা আপনাকে সত্যিই এগিয়ে দেয়</h2>
          <p className="sub">আরও বেশি MCQ নয় — প্রতিটি প্রশ্ন থেকে আরও বেশি শেখা।</p>
          <div className="grid g3">
            {FEATURES.map((f) => <div key={f.t} className="card feature"><div className="fi">{f.i}</div><h3>{f.t}</h3><p className="muted small" style={{ margin: 0 }}>{f.d}</p></div>)}
          </div>
          <div className="center mt2"><Link to="/features" className="btn ghost">সব ফিচার দেখুন →</Link></div>
        </div>
      </section>

      <section className="section" id="different">
        <div className="container">
          <h2>সাধারণ MCQ অ্যাপ বনাম আরোহণ</h2>
          <p className="sub">অন্য প্ল্যাটফর্ম প্রশ্ন দেয়। আরোহণ বলে দেয় কোন প্রশ্ন, কখন, কেন।</p>
          <div className="card table-wrap">
            <table className="table compare">
              <thead><tr><th /><th>সাধারণ প্রশ্নব্যাংক</th><th>আরোহণ</th></tr></thead>
              <tbody>{COMPARE.map((r) => <tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td><td>✅ {r[2]}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="grid g-main mt2">
            <div className="card">
              <h3>আমাদের ৫টি প্রতিশ্রুতি</h3>
              {PROMISES.map((p, i) => <div key={i} className="promise mb"><span className="n">{bn(i + 1)}</span><span>{p}</span></div>)}
            </div>
            <div className="card hero-card">
              <h3>প্রতিদিনের লুপ</h3>
              <p className="muted small">অ্যাপ খুলুন → আজকের মিশন → অনুশীলন → তাৎক্ষণিক ফলাফল → দুর্বলতা শনাক্ত → রিভিশন → রেডিনেস আপডেট → আগামীকালের পরিকল্পনা।</p>
              <p className="small" style={{ margin: 0 }}>লক্ষ্য বেশি স্ক্রিন-টাইম নয় — কম সময়ে বেশি প্রস্তুতি। মিশন শেষ হলে অ্যাপ নিজেই বলবে "আজকের জন্য যথেষ্ট"।</p>
            </div>
          </div>
        </div>
      </section>

      <HowItWorks />

      <section className="section" id="pricing">
        <div className="container">
          <h2>প্যাকেজ</h2>
          <p className="sub">অনুশীলন, লাইভ এক্সাম, ব্যাখ্যা ও ভুল রিপোর্ট সবসময় ফ্রি। ব্যক্তিগত বিশ্লেষণের জন্য এক্সাম পাস — bKash / Nagad / Rocket-এ, কোনো অটো-রিনিউ নেই।</p>
          <PackageGrid />
          <p className="center tiny muted mt">কোনো প্যাকেজই চাকরি বা ভর্তির নিশ্চয়তা দেয় না — আমরা দিই সঠিক প্রস্তুতির পথ।</p>
        </div>
      </section>

      {people?.some((p) => p.kind !== 'story') && (
        <section className="section alt">
          <div className="container">
            <h2>মেন্টর ও উপদেষ্টা</h2>
            <p className="sub">প্রশ্ন যাচাই, ব্যাখ্যা আর প্রস্তুতির গাইড যাঁরা দেখেন।</p>
            <PeopleGrid kind={people.some((p) => p.kind === 'mentor') ? 'mentor' : 'advisor'} limit={8} />
            <div className="center mt2"><Link to="/mentors" className="btn ghost">সবাইকে দেখুন →</Link></div>
          </div>
        </section>
      )}

      {guides?.rows.length > 0 && (
        <section className="section">
          <div className="container">
            <h2>প্রস্তুতির গাইড</h2>
            <p className="sub">লক্ষ্য পরীক্ষা অনুযায়ী কোথা থেকে শুরু করবেন, কী বাদ দেবেন।</p>
            <div className="grid g3">{guides.rows.map((p) => <PostCard key={p.id} p={p} />)}</div>
            <div className="center mt2"><Link to="/blog" className="btn ghost">সব গাইড →</Link></div>
          </div>
        </section>
      )}

      {people?.some((p) => p.kind === 'story') && (
        <section className="section alt">
          <div className="container">
            <h2>সফলতার গল্প</h2>
            <div className="grid g3">{people.filter((p) => p.kind === 'story').slice(0, 3).map((p) => (
              <div key={p.id} className="card"><b>{p.name}</b><div className="small muted">{p.role_line}</div>{p.bio && <p className="small">“{p.bio}”</p>}</div>
            ))}</div>
            <div className="center mt2"><Link to="/hall-of-fame" className="btn ghost">সব গল্প →</Link></div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="container" style={{ maxWidth: 860 }}>
          <h2>প্রশ্নোত্তর</h2>
          <div className="card mt"><FaqList limit={6} /></div>
          <div className="center mt"><Link to="/faq">সব প্রশ্নোত্তর →</Link></div>
        </div>
      </section>

      <CtaBand />
    </PublicLayout>
  );
}
