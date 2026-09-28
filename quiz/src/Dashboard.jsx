import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, bn, fmtDate, session } from './lib.js';
import { CopyLink } from './ui.jsx';

export const STATUS = { draft: ['খসড়া', 'mid'], live: ['চালু', 'good'], closed: ['বন্ধ', 'bad'] };

export default function Dashboard() {
  const nav = useNavigate();
  const admin = session.user?.role === 'admin';
  const [all, setAll] = useState(false);
  const [list, setList] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState('');
  const load = () => api(`/forms/mine${all ? '?all=1' : ''}`).then(setList).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [all]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    try { const { id } = await api('/forms', { method: 'POST', body: { title: 'নতুন পরীক্ষা' } }); nav(`/f/${id}`); } catch (e) { setErr(e.message); }
  };
  const shown = (list || []).filter((f) => !q || f.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="stack">
      <div className="row">
        <div><h1>আমার পরীক্ষা</h1><p className="muted small">পরীক্ষা বানিয়ে প্রকাশ করলেই লিংক তৈরি হবে — লিংকে গিয়ে যে কেউ নাম দিয়ে পরীক্ষা দিতে পারবে।</p></div>
        <span className="spacer" />
        <button className="btn accent" onClick={create}>+ নতুন পরীক্ষা</button>
      </div>
      {err && <div className="alert bad">{err}</div>}
      <div className="row">
        <input className="input grow" placeholder="🔎 পরীক্ষা খুঁজুন" value={q} onChange={(e) => setQ(e.target.value)} />
        {admin && <label className="check"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> সব শিক্ষকের পরীক্ষা</label>}
      </div>
      {!list ? <div className="loader" /> : !shown.length ? (
        <div className="card center empty"><div className="big-ico">🗒️</div><h3>{list.length ? 'কিছু পাওয়া যায়নি' : 'এখনো কোনো পরীক্ষা নেই'}</h3>
          {!list.length && <><p className="muted">প্রথম পরীক্ষাটি বানিয়ে ফেলুন — প্রশ্ন যোগ করুন, সময় আর নেগেটিভ মার্ক ঠিক করুন, তারপর লিংক শেয়ার করুন।</p>
            <button className="btn" onClick={create}>+ নতুন পরীক্ষা</button></>}</div>
      ) : (
        <div className="forms">
          {shown.map((f) => (
            <div key={f.id} className="card form-card">
              <div className="row"><span className={`badge ${STATUS[f.status][1]}`}>{STATUS[f.status][0]}</span><span className="spacer" /><span className="tiny muted">{fmtDate(f.updated_at)}</span></div>
              <Link to={`/f/${f.id}`} className="form-title">{f.title}</Link>
              <div className="small muted">{bn(f.questions)} প্রশ্ন · {f.duration_min ? `${bn(f.duration_min)} মিনিট` : 'সময়সীমা নেই'} · {bn(f.submissions)} জন দিয়েছে{all ? ` · ${f.owner}` : ''}</div>
              {f.status !== 'draft' && <CopyLink code={f.code} compact />}
              <div className="row">
                <Link className="btn small light" to={`/f/${f.id}`}>✏️ সম্পাদনা</Link>
                <Link className="btn small light" to={`/f/${f.id}/results`}>📊 ফলাফল</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
