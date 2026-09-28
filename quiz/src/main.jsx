import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import Login from './Login.jsx';
import Dashboard from './Dashboard.jsx';
import Editor from './Editor.jsx';
import Exam from './Exam.jsx';
import ExamResult from './ExamResult.jsx';
import { session } from './lib.js';
import './styles.css';

function StaffShell({ children }) {
  const nav = useNavigate();
  const u = session.user;
  if (!session.token || !['admin', 'teacher'].includes(u?.role)) return <Navigate to="/login" replace />;
  return (
    <>
      <header className="top">
        <div className="wrap wide row">
          <Link to="/" className="brand"><span className="logo">⛰️</span> আরোহণ <span className="tag">পরীক্ষা</span></Link>
          <span className="spacer" />
          <span className="who">{u.name} · {u.role === 'admin' ? 'অ্যাডমিন' : 'শিক্ষক'}</span>
          <button className="btn small light" onClick={() => { session.clear(); nav('/login'); }}>লগআউট</button>
        </div>
      </header>
      <main className="wrap wide">{children}</main>
    </>
  );
}

function PublicShell({ children }) {
  return (
    <>
      <header className="top slim"><div className="wrap row"><span className="brand"><span className="logo">⛰️</span> আরোহণ <span className="tag">পরীক্ষা</span></span></div></header>
      <main className="wrap">{children}</main>
      <footer className="foot wrap">আরোহণ অনলাইন পরীক্ষা</footer>
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<PublicShell><Login /></PublicShell>} />
        <Route path="/" element={<StaffShell><Dashboard /></StaffShell>} />
        <Route path="/f/:id/:tab?" element={<StaffShell><Editor /></StaffShell>} />
        <Route path="/e/:code" element={<PublicShell><Exam /></PublicShell>} />
        <Route path="/e/:code/r/:token" element={<PublicShell><ExamResult /></PublicShell>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
