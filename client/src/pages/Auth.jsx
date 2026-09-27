import { useState } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useFetch, ErrorBox } from '../components/ui.jsx';
import { TRACKS, DISTRICTS } from '../utils.js';

// Accept Bangla digits in phone numbers.
const normId = (s) => s.trim().replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d));

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [f, setF] = useState({ login: '', password: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const u = await login(normId(f.login), f.password); const staff = ['admin', 'teacher'].includes(u.role); nav(staff ? '/admin' : (loc.state?.from?.startsWith('/app') || loc.state?.from?.startsWith('/exam') ? loc.state.from : '/app')); } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <Link to="/" className="brand" style={{ color: 'var(--navy)', padding: 0, marginBottom: '1rem' }}><span className="logo">⛰️</span>আরোহণ</Link>
        <h2>লগইন করুন</h2>
        <ErrorBox error={err} />
        <div className="field"><label htmlFor="l">ইমেইল অথবা মোবাইল</label><input id="l" className="input" required value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} autoComplete="username" /></div>
        <div className="field"><label htmlFor="p">পাসওয়ার্ড</label><input id="p" type="password" className="input" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" /></div>
        <button className="btn block lg" disabled={busy}>{busy ? 'অপেক্ষা করুন…' : 'লগইন'}</button>
        <p className="center small mt"><Link to="/forgot">পাসওয়ার্ড ভুলে গেছেন?</Link></p>
        <p className="center small mt">অ্যাকাউন্ট নেই? <Link to="/register">ফ্রি রেজিস্ট্রেশন করুন</Link></p>
      </form>
    </div>
  );
}

export function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const ref = params.get('ref');
  const { data: exams } = useFetch('/catalog/exams');
  const [f, setF] = useState({ name: '', login: '', password: '', track: 'job', target_exam_id: '', district: '', institution: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const trackExams = exams?.filter((e) => e.track === f.track) || [];

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const id = normId(f.login);
    const isPhone = /^\+?[0-9]{10,14}$/.test(id);
    try {
      await register({ ref, name: f.name, password: f.password, track: f.track, district: f.district || null, institution: f.institution || null,
        target_exam_id: Number(f.target_exam_id) || trackExams[0]?.id || null, ...(isPhone ? { phone: id } : { email: id }) });
      nav('/app?welcome=1');
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <Link to="/" className="brand" style={{ color: 'var(--navy)', padding: 0, marginBottom: '1rem' }}><span className="logo">⛰️</span>আরোহণ</Link>
        <h2>ফ্রি অ্যাকাউন্ট খুলুন</h2>
        {ref && <div className="alert good small">🎁 বন্ধুর আমন্ত্রণে যোগ দিচ্ছেন — ৭ দিন বাড়তি ফ্রি ট্রায়াল পাবেন।</div>}
        <p className="muted small">২ মিনিটে শুরু — তারপর একটি ডায়াগনস্টিক টেস্ট দিয়ে আপনার প্রস্তুতি-মানচিত্র তৈরি হবে।</p>
        <ErrorBox error={err} />
        <div className="field"><label>আপনি কীসের প্রস্তুতি নিচ্ছেন?</label>
          <div className="track-pick">
            {Object.entries(TRACKS).map(([k, t]) => (
              <button type="button" key={k} className={f.track === k ? 'on' : ''} onClick={() => setF({ ...f, track: k, target_exam_id: '' })}>
                <span className="i">{t.icon}</span><b>{t.bn}</b><div className="tiny muted">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="field"><label htmlFor="ex">লক্ষ্য পরীক্ষা</label>
          <select id="ex" className="input" value={f.target_exam_id} onChange={set('target_exam_id')}>
            {trackExams.map((e) => <option key={e.id} value={e.id}>{e.name_bn}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="n">আপনার নাম</label><input id="n" className="input" required value={f.name} onChange={set('name')} autoComplete="name" /></div>
        <div className="field"><label htmlFor="lg">ইমেইল অথবা মোবাইল নম্বর</label><input id="lg" className="input" required value={f.login} onChange={set('login')} autoComplete="username" /></div>
        <div className="field"><label htmlFor="pw">পাসওয়ার্ড</label><input id="pw" type="password" className="input" required minLength={6} value={f.password} onChange={set('password')} autoComplete="new-password" /><small>কমপক্ষে ৬ অক্ষর</small></div>
        <div className="grid g2">
          <div className="field"><label htmlFor="d">জেলা</label>
            <select id="d" className="input" value={f.district} onChange={set('district')}><option value="">বেছে নিন</option>{DISTRICTS.map((d) => <option key={d}>{d}</option>)}</select>
          </div>
          <div className="field"><label htmlFor="i">প্রতিষ্ঠান (ঐচ্ছিক)</label><input id="i" className="input" value={f.institution} onChange={set('institution')} placeholder="যেমন: রাজশাহী বিশ্ববিদ্যালয়" /></div>
        </div>
        <button className="btn accent block lg" disabled={busy}>{busy ? 'অপেক্ষা করুন…' : 'অ্যাকাউন্ট খুলুন'}</button>
        <p className="center small mt">আগেই অ্যাকাউন্ট আছে? <Link to="/login">লগইন</Link></p>
      </form>
    </div>
  );
}
