import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, tokenStore } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorBox } from '../components/ui.jsx';

const normId = (s) => s.trim().replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d));

export default function Forgot() {
  const nav = useNavigate();
  const { refresh } = useAuth();
  const [step, setStep] = useState(1);
  const [login, setLogin] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const request = async (e) => {
    e?.preventDefault(); setBusy(true); setErr(null);
    try {
      const d = await api.post('/auth/forgot', { login: normId(login) });
      setInfo(d.dev_code ? `${d.message} (ডেভেলপমেন্ট মোড — কোড: ${d.dev_code})` : d.message);
      setStep(2);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  const reset = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const d = await api.post('/auth/reset', { login: normId(login), code: normId(code), password });
      tokenStore.set(d.token); await refresh(); nav(['admin', 'teacher'].includes(d.user.role) ? '/admin' : '/app');
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={step === 1 ? request : reset}>
        <Link to="/" className="brand" style={{ color: 'var(--navy)', padding: 0, marginBottom: '1rem' }}><span className="logo">⛰️</span>আরোহণ</Link>
        <h2>পাসওয়ার্ড রিসেট</h2>
        <ErrorBox error={err} />
        {step === 1 ? <>
          <p className="small muted">অ্যাকাউন্টের ইমেইল বা মোবাইল নম্বর দিন — একটি ৬ অঙ্কের কোড পাঠানো হবে।</p>
          <div className="field"><label htmlFor="fl">ইমেইল অথবা মোবাইল</label><input id="fl" className="input" required value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" /></div>
          <button className="btn block lg" disabled={busy}>{busy ? 'পাঠানো হচ্ছে…' : 'কোড পাঠান'}</button>
        </> : <>
          {info && <div className="alert good small">{info}</div>}
          <div className="field"><label htmlFor="fc">৬ অঙ্কের কোড</label><input id="fc" className="input" required inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} /></div>
          <div className="field"><label htmlFor="fp">নতুন পাসওয়ার্ড</label><input id="fp" type="password" className="input" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></div>
          <button className="btn block lg" disabled={busy}>{busy ? 'অপেক্ষা করুন…' : 'পাসওয়ার্ড বদলান ও লগইন করুন'}</button>
          <button type="button" className="linkbtn small mt" onClick={request} disabled={busy}>কোড পাননি? আবার পাঠান</button>
        </>}
        <p className="center small mt"><Link to="/login">লগইনে ফিরে যান</Link></p>
      </form>
    </div>
  );
}
