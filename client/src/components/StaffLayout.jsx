import { Suspense } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Loader } from './ui.jsx';
import { STAFF_SECTIONS } from '../pages/Admin.jsx';

// Admins and teachers get their own workspace: management tools only, no student practice UI.
export default function StaffLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const groups = STAFF_SECTIONS
    .map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(user.role)) }))
    .filter((g) => g.items.length);
  const roleLabel = user.role === 'admin' ? 'অ্যাডমিন' : 'শিক্ষক';
  const all = groups.flatMap((g) => g.items);

  return (
    <div className="app">
      <aside className="sidebar">
        <Link to="/admin" className="brand"><span className="logo">⛰️</span><span>আরোহণ<small>{roleLabel} প্যানেল</small></span></Link>
        <nav className="nav" aria-label="ব্যবস্থাপনা মেনু">
          {groups.map((g) => (
            <div key={g.group || 'main'}>
              {g.group && <div className="section">{g.group}</div>}
              {g.items.map((i) => (
                <NavLink key={i.key} to={i.href || (i.key === 'overview' ? '/admin' : `/admin/${i.key}`)} end={i.key === 'overview'}>
                  <span className="ico">{i.icon}</span>{i.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="me">
          <div style={{ color: '#fff', fontWeight: 600 }}>{user.name}</div>
          <div className="tiny" style={{ color: '#9aa0cf' }}>{roleLabel}{user.institution ? ` · ${user.institution}` : ''}</div>
          <button className="linkbtn tiny" style={{ color: '#fca5a5', marginTop: '.4rem' }} onClick={() => { logout(); nav('/'); }}>লগআউট</button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <Link to="/admin" className="show-mobile" style={{ fontWeight: 700, fontSize: '1.15rem', color: 'var(--navy)' }}>⛰️ {roleLabel} প্যানেল</Link>
          <div className="spacer" />
          <span className="badge accent">{roleLabel}</span>
          <button className="btn light sm show-mobile" onClick={() => { logout(); nav('/'); }}>লগআউট</button>
        </header>
        <main className="page"><Suspense fallback={<Loader />}><Outlet /></Suspense></main>
      </div>
      {/* On phones the sidebar is hidden, so the sections scroll horizontally in the bottom bar. */}
      <nav className="bottom-nav staff" aria-label="মোবাইল মেনু">
        {all.map((i) => (
          <NavLink key={i.key} to={i.href || (i.key === 'overview' ? '/admin' : `/admin/${i.key}`)} end={i.key === 'overview'}>
            <span className="ico">{i.icon}</span>{i.label.split(' ')[0]}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
