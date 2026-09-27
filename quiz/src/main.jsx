import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import Home from './Home.jsx';
import Play from './Play.jsx';
import Result from './Result.jsx';
import { signupUrl } from './lib.js';
import './styles.css';

function Shell({ children }) {
  return (
    <>
      <header className="top">
        <div className="wrap row">
          <Link to="/" className="brand"><span className="logo">⛰️</span> আরোহণ <span className="tag">কুইজ</span></Link>
          <span className="spacer" />
          <a className="btn small accent" href={signupUrl('header')}>ফ্রি অ্যাকাউন্ট</a>
        </div>
      </header>
      <main className="wrap">{children}</main>
      <footer className="foot wrap">© আরোহণ · প্রতিদিন নতুন কুইজ · <a href={signupUrl('footer')}>পূর্ণ প্রস্তুতি শুরু করুন</a></footer>
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/play/:kind/:id?" element={<Play />} />
          <Route path="/c/:code" element={<Play challenge />} />
          <Route path="/result" element={<Result />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  </StrictMode>,
);
