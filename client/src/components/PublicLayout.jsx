import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { useFetch } from './ui.jsx';
import { bn } from '../utils.js';

// Header menu for the public website. Items with `items` open as a dropdown.
export const MENU = [
  { label: 'আরোহণ সম্পর্কে', items: [
    ['/about', 'আমাদের গল্প', 'কেন আরোহণ, কীভাবে কাজ করে'],
    ['/mentors', 'মেন্টর ও উপদেষ্টা', 'যাঁরা প্রশ্ন ও কনটেন্ট দেখেন'],
    ['/hall-of-fame', 'সফলতার গল্প', 'শিক্ষার্থীদের নিজের কথা'],
    ['/faq', 'প্রশ্নোত্তর', 'প্যাকেজ, পেমেন্ট ও পরীক্ষা'],
    ['/help', 'হেল্প সেন্টার', 'আরোহণ ব্যবহারের গাইড'],
  ] },
  { label: 'পরীক্ষা', exams: true },
  { label: 'ফিচার', to: '/features' },
  { label: 'প্যাকেজ', to: '/packages' },
  { label: 'তথ্যকেন্দ্র', items: [
    ['/routine', 'লাইভ পরীক্ষার রুটিন', 'আগামী ৩০ দিনের লাইভ পরীক্ষা'],
    ['/circulars', 'চাকরির সার্কুলার', 'সরকারি ও বেসরকারি নিয়োগ'],
    ['/notices', 'নোটিশ ও রুটিন', 'পরীক্ষার তারিখ, ফলাফল, সিলেবাস'],
    ['/blog', 'ব্লগ ও গাইড', 'প্রস্তুতির কৌশল ও বিশ্লেষণ'],
    ['/resources', 'রিসোর্স লাইব্রেরি', 'PDF, ভিডিও, রুটিন ও আর্কাইভ'],
    ['/omr', 'OMR শিট', 'প্রিন্ট করে ঘরে বসে অনুশীলন'],
    ['/ask', 'মেন্টরকে প্রশ্ন', 'প্রস্তুতি নিয়ে সরাসরি জিজ্ঞাসা'],
  ] },
  { label: 'যোগাযোগ', to: '/contact' },
];

const FOOTER = [
  ['প্ল্যাটফর্ম', [['/features', 'ফিচার'], ['/packages', 'প্যাকেজ'], ['/demo-exam', 'ফ্রি ডেমো পরীক্ষা'], ['/omr', 'OMR শিট'], ['/referral', 'রেফারেল প্রোগ্রাম']]],
  ['তথ্যকেন্দ্র', [['/routine', 'লাইভ পরীক্ষার রুটিন'], ['/circulars', 'চাকরির সার্কুলার'], ['/notices', 'নোটিশ ও রুটিন'], ['/blog', 'ব্লগ'], ['/resources/pdf', 'PDF ও নোট'], ['/resources/videos', 'ভিডিও ক্লাস']]],
  ['আরোহণ', [['/about', 'আমাদের গল্প'], ['/mentors', 'মেন্টর'], ['/hall-of-fame', 'সফলতার গল্প'], ['/partnership', 'পার্টনারশিপ'], ['/contact', 'যোগাযোগ']]],
  ['সাহায্য', [['/help', 'হেল্প সেন্টার'], ['/ask', 'মেন্টরকে প্রশ্ন'], ['/faq', 'প্রশ্নোত্তর'], ['/privacy', 'প্রাইভেসি পলিসি'], ['/terms', 'শর্তাবলি ও রিফান্ড']]],
];

const THEME_KEY = 'arohon_site_theme';
const readTheme = () => {
  try { const t = localStorage.getItem(THEME_KEY); if (t) return t; } catch { /* storage blocked */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

function SearchBox({ onClose }) {
  const [q, setQ] = useState('');
  const nav = useNavigate();
  return (
    <form className="site-search" role="search" onSubmit={(e) => { e.preventDefault(); if (q.trim()) { nav(`/search?q=${encodeURIComponent(q.trim())}`); onClose(); } }}>
      <input autoFocus className="input" placeholder="সার্কুলার, গাইড, পরীক্ষা খুঁজুন…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="খুঁজুন" />
      <button className="btn">খুঁজুন</button>
      <button type="button" className="btn light" onClick={onClose} aria-label="বন্ধ করুন">✕</button>
    </form>
  );
}

function Newsletter() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState(null);
  const submit = async (e) => {
    e.preventDefault(); setState('busy');
    try { await api.post('/site/newsletter', { email }); setState('ok'); setEmail(''); } catch (err) { setState(err.message); }
  };
  return (
    <form onSubmit={submit} className="newsletter">
      <b style={{ color: '#fff' }}>প্রতি সপ্তাহে প্রস্তুতির আপডেট</b>
      <p className="small" style={{ margin: '.3rem 0 .6rem' }}>নতুন সার্কুলার, পরীক্ষার তারিখ ও গাইড — ইমেইলে।</p>
      <div className="row"><input type="email" required className="input" style={{ flex: 1, minWidth: 0 }} placeholder="আপনার ইমেইল" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="ইমেইল" />
        <button className="btn accent" disabled={!email || state === 'busy'}>সাবস্ক্রাইব</button></div>
      {state === 'ok' && <div className="tiny mt" style={{ color: '#86efac' }}>✓ ধন্যবাদ! তালিকায় যুক্ত হয়েছেন।</div>}
      {state && !['ok', 'busy'].includes(state) && <div className="tiny mt" style={{ color: '#fca5a5' }}>{state}</div>}
    </form>
  );
}

export default function PublicLayout({ children }) {
  const { user } = useAuth();
  const loc = useLocation();
  const [theme, setTheme] = useState(readTheme);
  const [open, setOpen] = useState(null);
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState(false);
  const home = ['admin', 'teacher'].includes(user?.role) ? '/admin' : '/app';
  const { data: exams } = useFetch('/catalog/exams');
  const menu = MENU.map((m) => (m.exams
    ? { label: m.label, items: [...(exams || []).filter((e) => e.track === 'job').map((e) => [`/exams/${e.code}`, e.name_bn, e.description || '']), ['/demo-exam', 'ফ্রি ডেমো পরীক্ষা', 'লগইন ছাড়াই যাচাই করুন']] }
    : m));

  useEffect(() => { setOpen(null); setDrawer(false); window.scrollTo(0, 0); }, [loc.pathname]);
  const toggleTheme = () => {
    const t = theme === 'dark' ? 'light' : 'dark';
    setTheme(t);
    try { localStorage.setItem(THEME_KEY, t); } catch { /* storage blocked */ }
  };

  return (
    <div className="site" data-theme={theme}>
      <a href="#main" className="skip-link">মূল কনটেন্টে যান</a>
      <header className="pub-header">
        <div className="container">
          <Link to="/" className="brand" style={{ padding: 0 }}><span className="logo">⛰️</span><span>আরোহণ</span></Link>
          <nav aria-label="প্রধান মেনু" className="site-nav">
            {menu.map((m) => m.items ? (
              <div key={m.label} className="dd" onMouseLeave={() => setOpen(null)}>
                <button className="dd-btn" aria-expanded={open === m.label} onClick={() => setOpen(open === m.label ? null : m.label)} onMouseEnter={() => setOpen(m.label)}>{m.label} ▾</button>
                {open === m.label && (
                  <div className="dd-menu" role="menu">
                    {m.items.map(([to, t, d]) => <Link key={to} to={to} role="menuitem"><b>{t}</b><span>{d}</span></Link>)}
                  </div>
                )}
              </div>
            ) : <NavLink key={m.to} to={m.to}>{m.label}</NavLink>)}
          </nav>
          <div className="spacer" />
          <button className="icon-btn" onClick={() => setSearch((s) => !s)} aria-label="খুঁজুন">🔍</button>
          <button className="icon-btn" onClick={toggleTheme} aria-label={theme === 'dark' ? 'লাইট মোড' : 'ডার্ক মোড'}>{theme === 'dark' ? '☀️' : '🌙'}</button>
          <div className="hide-mobile row">
            {user ? <Link className="btn accent" to={home}>ড্যাশবোর্ড</Link> : <>
              <Link to="/login" style={{ color: '#fff', fontWeight: 600 }}>লগইন</Link>
              <Link className="btn accent" to="/register">ফ্রি শুরু করুন</Link>
            </>}
          </div>
          <button className="icon-btn show-mobile" onClick={() => setDrawer((d) => !d)} aria-label="মেনু" aria-expanded={drawer}>☰</button>
        </div>
        {search && <div className="container"><SearchBox onClose={() => setSearch(false)} /></div>}
        {drawer && (
          <div className="site-drawer">
            {menu.map((m) => m.items
              ? <div key={m.label}><div className="tiny" style={{ color: '#9aa0d0', margin: '.6rem 0 .2rem' }}>{m.label}</div>{m.items.map(([to, t]) => <Link key={to} to={to}>{t}</Link>)}</div>
              : <Link key={m.to} to={m.to}>{m.label}</Link>)}
            <div className="row mt">{user ? <Link className="btn accent block" to={home}>ড্যাশবোর্ড</Link> : <>
              <Link className="btn light" to="/login">লগইন</Link><Link className="btn accent" to="/register">ফ্রি শুরু করুন</Link></>}</div>
          </div>
        )}
      </header>

      <main id="main">{children}</main>

      <footer className="footer">
        <div className="container footer-grid">
          <div>
            <b style={{ color: '#fff', fontSize: '1.2rem' }}>⛰️ আরোহণ</b>
            <p className="small">একাডেমিক, ভর্তি ও চাকরির পরীক্ষার জন্য ব্যক্তিগত প্রস্তুতি সিস্টেম — কী পড়বেন, কেন নম্বর হারাচ্ছেন, আর আজ কী করলে সবচেয়ে বেশি লাভ।</p>
            <Newsletter />
          </div>
          {FOOTER.map(([h, links]) => (
            <div key={h}>
              <h4 style={{ color: '#fff' }}>{h}</h4>
              {links.map(([to, t]) => <div key={to}><Link to={to}>{t}</Link></div>)}
            </div>
          ))}
        </div>
        <div className="container tiny mt2">© {bn(new Date().getFullYear())} আরোহণ · কোনো প্যাকেজ চাকরি বা ভর্তির নিশ্চয়তা দেয় না।</div>
      </footer>
    </div>
  );
}

// Section header used across public pages.
export const PageHero = ({ kicker, title, sub, children }) => (
  <section className="page-hero">
    <div className="container">
      {kicker && <span className="kicker">{kicker}</span>}
      <h1>{title}</h1>
      {sub && <p className="lead">{sub}</p>}
      {children}
    </div>
  </section>
);
