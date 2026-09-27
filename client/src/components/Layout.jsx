import { Suspense } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useFetch, Loader } from './ui.jsx';
import { bn, TRACKS } from '../utils.js';

const NAV = [
  { to: '/app', ico: '🏠', label: 'হোম', end: true },
  { to: '/app/practice', ico: '📝', label: 'অনুশীলন' },
  { to: '/app/live', ico: '🔴', label: 'লাইভ এক্সাম' },
  { to: '/app/planner', ico: '🗓️', label: 'স্টাডি প্ল্যানার' },
  { to: '/app/mistakes', ico: '🧠', label: 'ভুল ও রিভিশন' },
  { to: '/app/analytics', ico: '📊', label: 'রেডিনেস ও অগ্রগতি' },
  { to: '/app/coach', ico: '🤖', label: 'এআই কোচ' },
  { section: 'লিখিত ও ভাইভা' },
  { to: '/app/written', ico: '✍️', label: 'লিখিত প্রস্তুতি' },
  { to: '/app/viva', ico: '🎙️', label: 'মক ভাইভা' },
  { section: 'আরও' },
  { to: '/app/intelligence', ico: '🔎', label: 'প্রশ্ন বিশ্লেষণ' },
  { to: '/app/current-affairs', ico: '📰', label: 'সাম্প্রতিক বিষয়াবলি' },
  { to: '/app/battles', ico: '⚔️', label: '১-বনাম-১ ব্যাটল' },
  { to: '/app/groups', ico: '👥', label: 'স্টাডি গ্রুপ' },
  { to: '/app/leaderboard', ico: '🏆', label: 'লিডারবোর্ড' },
  { to: '/app/history', ico: '🗂️', label: 'পরীক্ষার ইতিহাস' },
  { to: '/app/bookmarks', ico: '🔖', label: 'সংরক্ষিত প্রশ্ন' },
  { to: '/app/billing', ico: '💳', label: 'এক্সাম পাস' },
  { to: '/app/profile', ico: '⚙️', label: 'প্রোফাইল ও লক্ষ্য' },
];

const BOTTOM = [
  { to: '/app', ico: '🏠', label: 'হোম', end: true },
  { to: '/app/practice', ico: '📝', label: 'অনুশীলন' },
  { to: '/app/live', ico: '🔴', label: 'লাইভ' },
  { to: '/app/coach', ico: '🤖', label: 'কোচ' },
  { to: '/app/more', ico: '☰', label: 'আরও' },
];

export default function Layout() {
  const { user, logout, updateProfile } = useAuth();
  const nav = useNavigate();
  const { data: exams } = useFetch('/catalog/exams');
  const staff = ['admin', 'teacher'].includes(user.role);

  const switchExam = async (e) => {
    await updateProfile({ target_exam_id: Number(e.target.value) });
    nav('/app');
    window.dispatchEvent(new Event('arohon:target-changed'));
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <Link to="/app" className="brand"><span className="logo">⛰️</span><span>আরোহণ<small>পার্সোনাল এক্সাম সিস্টেম</small></span></Link>
        <nav className="nav" aria-label="প্রধান মেনু">
          {NAV.map((n, i) => n.section
            ? <div className="section" key={i}>{n.section}</div>
            : <NavLink key={n.to} to={n.to} end={n.end}><span className="ico">{n.ico}</span>{n.label}</NavLink>)}
          {staff && <><div className="section">ব্যবস্থাপনা</div><NavLink to="/app/admin"><span className="ico">🛠️</span>{user.role === 'admin' ? 'অ্যাডমিন প্যানেল' : 'শিক্ষক ড্যাশবোর্ড'}</NavLink></>}
        </nav>
        <div className="me">
          <div style={{ color: '#fff', fontWeight: 600 }}>{user.name}</div>
          <div className="tiny" style={{ color: '#9aa0cf' }}>{TRACKS[user.track]?.bn} ট্র্যাক · {bn(user.xp)} XP</div>
          <button className="linkbtn tiny" style={{ color: '#fca5a5', marginTop: '.4rem' }} onClick={() => { logout(); nav('/'); }}>লগআউট</button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <Link to="/app" className="show-mobile" style={{ fontWeight: 700, fontSize: '1.15rem', color: 'var(--navy)' }}>⛰️ আরোহণ</Link>
          <div className="track-switch hide-mobile">
            <label className="small muted" htmlFor="target-exam">লক্ষ্য পরীক্ষা: </label>
            <select id="target-exam" value={user.target_exam_id || ''} onChange={switchExam}>
              {!user.target_exam_id && <option value="">বেছে নিন</option>}
              {['job', 'admission', 'academic'].map((t) => (
                <optgroup key={t} label={`${TRACKS[t].icon} ${TRACKS[t].bn}`}>
                  {exams?.filter((e) => e.track === t).map((e) => <option key={e.id} value={e.id}>{e.name_bn}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="spacer" />
          <TierPill access={user.access} />
          <span className="streak-pill" title="ধারাবাহিক দিন">🔥 {bn(user.streak)}</span>
          <span className="xp-pill hide-mobile" title="অভিজ্ঞতা পয়েন্ট">⭐ {bn(user.xp)}</span>
        </header>
        <main className="page"><Suspense fallback={<Loader />}><Outlet /></Suspense></main>
      </div>
      <nav className="bottom-nav" aria-label="মোবাইল মেনু">
        {BOTTOM.map((n) => <NavLink key={n.to} to={n.to} end={n.end}><span className="ico">{n.ico}</span>{n.label}</NavLink>)}
      </nav>
    </div>
  );
}

function TierPill({ access }) {
  if (!access || access.tier === 'staff') return null;
  if (access.tier === 'pro') return <Link to="/app/billing" className="tier-pill pro">⭐ PRO</Link>;
  if (access.tier === 'trial') {
    const d = Math.max(0, Math.ceil((new Date(access.until) - Date.now()) / 86400000));
    return <Link to="/app/billing" className="tier-pill trial">🎁 ট্রায়াল · {bn(d)} দিন</Link>;
  }
  return <Link to="/app/billing" className="tier-pill free">আপগ্রেড</Link>;
}

// Mobile "more" menu.
export function MoreMenu() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const items = NAV.filter((n) => n.to && !BOTTOM.some((b) => b.to === n.to));
  if (['admin', 'teacher'].includes(user.role)) items.push({ to: '/app/admin', ico: '🛠️', label: 'ব্যবস্থাপনা' });
  return (
    <div className="card">
      {items.map((n) => <Link key={n.to} to={n.to} className="mission-item" style={{ color: 'var(--text)', textDecoration: 'none' }}><span>{n.ico}</span><span>{n.label}</span></Link>)}
      <button className="btn light block mt" onClick={() => { logout(); nav('/'); }}>লগআউট</button>
    </div>
  );
}
