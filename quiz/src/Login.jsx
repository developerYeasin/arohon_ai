import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, session } from './lib.js';

export default function Login() {
  const nav = useNavigate();
  const [f, setF] = useState({ login: '', password: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  if (session.token && ['admin', 'teacher'].includes(session.user?.role)) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      const { token, user } = await api('/auth/login', { method: 'POST', body: { login: f.login.trim(), email: f.login.trim(), password: f.password } });
      if (!['admin', 'teacher'].includes(user.role)) throw new Error('এখানে শুধু শিক্ষক ও অ্যাডমিন লগইন করতে পারবেন। পরীক্ষা দিতে শিক্ষকের দেওয়া লিংক খুলুন।');
      session.save(token, user); nav('/');
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  return (
    <form className="card stack narrow" onSubmit={submit}>
      <div className="center"><div className="big-ico">📝</div><h1>শিক্ষক / অ্যাডমিন লগইন</h1>
        <p className="muted small">পরীক্ষা বানান, লিংক শেয়ার করুন, ফলাফল দেখুন।</p></div>
      {err && <div className="alert bad">{err}</div>}
      <label className="field"><span>ইমেইল বা ফোন</span><input className="input" autoComplete="username" value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} required /></label>
      <label className="field"><span>পাসওয়ার্ড</span><input className="input" type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></label>
      <button className="btn block" disabled={busy}>{busy ? 'অপেক্ষা করুন…' : 'লগইন'}</button>
    </form>
  );
}
