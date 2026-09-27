import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useFetch, useStartTest, Loader, ErrorBox, Bar, Locked, Empty } from '../components/ui.jsx';
import { bn, fmtDate } from '../utils.js';

const ICON = { revision: '🔁', subject: '📚', mock: '🏛️', current_affairs: '📰', rest: '😴', exam: '🎯' };

export function WeekGoal({ progress, onChange, compact }) {
  const [edit, setEdit] = useState(false);
  const [goal, setGoal] = useState(progress.goal);
  const save = async () => { const p = await api.put('/analytics/weekly-goal', { goal }); onChange?.(p); setEdit(false); };
  const max = Math.max(1, ...progress.days.map((d) => d.questions));
  return (
    <div className="card">
      <div className="row between">
        <h3 style={{ margin: 0 }}>📅 সাপ্তাহিক লক্ষ্য</h3>
        {edit ? (
          <span className="row"><input type="number" className="input" style={{ width: 90 }} value={goal} onChange={(e) => setGoal(Number(e.target.value))} aria-label="সাপ্তাহিক প্রশ্ন লক্ষ্য" /><button className="btn sm" onClick={save}>সংরক্ষণ</button></span>
        ) : <button className="linkbtn small" onClick={() => setEdit(true)}>লক্ষ্য বদলান</button>}
      </div>
      <div className="row between small mt"><span>{bn(progress.done)} / {bn(progress.goal)} প্রশ্ন</span><b>{bn(progress.percent)}%</b></div>
      <Bar value={progress.percent} tone={progress.percent >= 100 ? 'good' : 'mid'} />
      {!compact && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)', gap: '.3rem', marginTop: '.8rem', alignItems: 'end', height: 90 }}>
          {progress.days.map((d) => (
            <div key={d.date} title={`${d.weekday}: ${d.questions} প্রশ্ন`} style={{ textAlign: 'center' }}>
              <div style={{ height: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                <div style={{ width: '70%', height: `${Math.max(4, (d.questions / max) * 60)}px`, background: d.questions ? 'var(--brand)' : '#eceef6', borderRadius: 6 }} />
              </div>
              <div className="tiny muted">{d.weekday.slice(0, 2)}</div>
            </div>
          ))}
        </div>
      )}
      <p className="tiny muted" style={{ margin: '.4rem 0 0' }}>সপ্তাহ শুরু শনিবার। লক্ষ্য পূরণ হলে বিশ্রাম নিতে দ্বিধা করবেন না।</p>
    </div>
  );
}

export default function Planner() {
  const { data, error, loading, setData } = useFetch('/analytics/planner');
  const { start, busy, error: startErr } = useStartTest();
  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Empty title="লক্ষ্য পরীক্ষা নির্বাচন করুন" />;

  const run = (it, key) => {
    if (it.type === 'subject') return start('/tests/adaptive', { subjectIds: [it.subject_id], count: 20, focus: 'weak' }, key);
    if (it.type === 'mock') return start('/tests/mock', { count: 25 }, key);
    if (it.type === 'revision') return start('/tests/revision', {}, key);
    if (it.type === 'current_affairs') return start('/tests/current-affairs', { count: 5 }, key);
    return null;
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>🗓️ স্টাডি প্ল্যানার</h1><p>{data.label} · {data.exam.name} · দৈনিক {bn(data.daily_minutes)} মিনিট {data.days_left != null ? `· পরীক্ষার বাকি ${bn(data.days_left)} দিন` : ''}</p></div>
        <Link to="/app/profile" className="btn light sm">সময় ও তারিখ বদলান</Link>
      </div>
      <ErrorBox error={startErr} />
      <WeekGoal progress={data.progress} onChange={(p) => setData({ ...data, progress: p })} />

      <div>
        <h3>এই সপ্তাহের পরিকল্পনা</h3>
        <p className="small muted">বিষয়ের সময় ভাগ হয় পরীক্ষায় নম্বর × আপনার দুর্বলতা অনুযায়ী — যেখানে সবচেয়ে বেশি নম্বর তোলার সুযোগ, সেখানে বেশি সময়।</p>
        <div className="grid g4">
          {data.week.map((d, i) => (
            <div key={d.date} className="card" style={i === 0 ? { borderColor: 'var(--brand)', borderWidth: 2 } : null}>
              <div className="row between"><b>{i === 0 ? 'আজ' : d.weekday}</b><span className="tiny muted">{fmtDate(d.date)}</span></div>
              {d.note && <div className="badge mid mt">{d.note}</div>}
              {d.items.map((it, k) => (
                <div key={k} style={{ padding: '.45rem 0', borderBottom: '1px dashed var(--line)' }}>
                  <div className="small">{ICON[it.type]} {it.title}</div>
                  <div className="row between">
                    {it.minutes > 0 && <span className="tiny muted">~{bn(it.minutes)} মিনিট</span>}
                    {i === 0 && ['subject', 'mock', 'revision', 'current_affairs'].includes(it.type) && (
                      <button className="btn ghost sm" disabled={!!busy} onClick={() => run(it, `${i}-${k}`)}>{busy === `${i}-${k}` ? '…' : 'শুরু'}</button>
                    )}
                  </div>
                </div>
              ))}
              {d.minutes > 0 && <div className="tiny muted mt">মোট ~{bn(d.minutes)} মিনিট</div>}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>🧭 {data.days_left != null ? 'পরীক্ষা পর্যন্ত পর্যায়ভিত্তিক পরিকল্পনা' : 'আগামী ৪ সপ্তাহ'}</h3>
        {data.days_left == null && <p className="small muted">প্রোফাইলে পরীক্ষার তারিখ দিলে পরীক্ষা পর্যন্ত পূর্ণ কাউন্টডাউন পরিকল্পনা তৈরি হবে।</p>}
        {data.phases_locked ? <Locked title="দীর্ঘমেয়াদি পর্যায়ভিত্তিক পরিকল্পনা">পরীক্ষার তারিখ পর্যন্ত ভিত্তি → অনুশীলন → সিমুলেশন → রিভিশন</Locked> : (
          <div className="grid g4">
            {data.phases.map((p) => (
              <div key={p.name} className="dim" style={p.current ? { background: 'var(--brand-soft)', outline: '2px solid var(--brand-2)' } : null}>
                <div className="row between"><b>{p.name}</b>{p.current && <span className="badge">এখন</span>}</div>
                <div className="tiny muted">{fmtDate(p.from)} – {fmtDate(p.to)} · {bn(p.days)} দিন</div>
                <div className="small mt" style={{ marginTop: '.3rem' }}>{p.desc}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
