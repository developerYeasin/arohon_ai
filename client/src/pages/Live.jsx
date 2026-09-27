import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useFetch, Loader, ErrorBox, Empty } from '../components/ui.jsx';
import { bn, fmtDate, fmtDuration, TRACKS } from '../utils.js';

export default function Live() {
  const [all, setAll] = useState(false);
  const { data, error, loading } = useFetch(`/tests/live${all ? '?all=1' : ''}`, [all]);
  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  const groups = { running: 'এখন চলছে', upcoming: 'আসন্ন', ended: 'শেষ হয়েছে' };

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>🔴 লাইভ এক্সাম</h1><p>নির্দিষ্ট সময়ে সারা দেশের পরীক্ষার্থীদের সাথে একই প্রশ্নে পরীক্ষা — বাস্তব র‍্যাংক ও পার্সেন্টাইল।</p></div>
        <div className="chips"><button className={`chip ${!all ? 'active' : ''}`} onClick={() => setAll(false)}>আমার ট্র্যাক</button><button className={`chip ${all ? 'active' : ''}`} onClick={() => setAll(true)}>সব ট্র্যাক</button></div>
      </div>
      <div className="alert small">ন্যায্য প্রতিযোগিতা: প্রতিটি লাইভ এক্সামে একবারই অংশ নেওয়া যায়, সময় শেষ হওয়ার আগে সঠিক উত্তর প্রকাশ হয় না, আর সন্দেহজনকভাবে দ্রুত শতভাগ সঠিক উত্তরগুলো লিডারবোর্ড থেকে বাদ পড়ে।</div>
      {!data.length && <div className="card"><Empty icon="📅" title="কোনো লাইভ এক্সাম নেই">শিগগিরই নতুন লাইভ এক্সাম আসবে।</Empty></div>}
      {Object.entries(groups).map(([state, label]) => {
        const rows = data.filter((t) => t.state === state);
        if (!rows.length) return null;
        return (
          <div key={state}>
            <h3>{label}</h3>
            <div className="grid g2">
              {rows.map((t) => (
                <div key={t.id} className="card">
                  <div className="row between">
                    {state === 'running' ? <span className="badge live">লাইভ</span> : state === 'upcoming' ? <span className="badge accent">আসন্ন</span> : <span className="badge gray">সমাপ্ত</span>}
                    {t.track && <span className="tiny muted">{TRACKS[t.track]?.icon} {TRACKS[t.track]?.bn}</span>}
                  </div>
                  <h3 className="mt" style={{ marginTop: '.5rem' }}>{t.title}</h3>
                  <div className="small muted">{bn(t.questions)} প্রশ্ন · {fmtDuration(t.duration_sec)} · নেগেটিভ {Number(t.negative_mark) ? bn(Number(t.negative_mark)) : 'নেই'}</div>
                  <div className="small muted">শুরু: {fmtDate(t.starts_at, true)} · শেষ: {fmtDate(t.ends_at, true)}</div>
                  <div className="small">{bn(t.participants)} জন অংশ নিয়েছেন</div>
                  <div className="row mt">
                    {t.my_status === 'submitted'
                      ? <Link className="btn light sm" to={`/app/result/${t.my_attempt_id}`}>আমার ফলাফল</Link>
                      : state === 'running' && <Link className="btn danger sm" to={`/exam/${t.id}`}>{t.my_status === 'in_progress' ? 'চালিয়ে যান' : 'এখনই অংশ নিন'}</Link>}
                    {state !== 'upcoming' && <Link className="btn ghost sm" to={`/app/leaderboard/test/${t.id}`}>লিডারবোর্ড</Link>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TestLeaderboard() {
  const { testId } = useParams();
  const { user } = useAuth();
  const { data, error, loading } = useFetch(`/tests/${testId}/leaderboard`);
  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  return (
    <div className="stack">
      <div className="page-head"><div><h1>🏆 {data.test.title}</h1><p>স্কোর সমান হলে কম সময় নেওয়া পরীক্ষার্থী এগিয়ে।</p></div></div>
      <div className="card table-wrap">
        {data.rows.length === 0 ? <Empty title="এখনো কেউ জমা দেননি" /> : (
          <table className="table">
            <thead><tr><th>#</th><th>নাম</th><th>জেলা</th><th>প্রতিষ্ঠান</th><th>স্কোর</th><th>সঠিক/ভুল</th><th>সময়</th></tr></thead>
            <tbody>{data.rows.map((r) => (
              <tr key={r.attempt_id} className={r.user_id === user.id ? 'me' : ''}>
                <td>{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : bn(r.rank)}</td><td>{r.name}</td><td>{r.district || '—'}</td><td className="small">{r.institution || '—'}</td>
                <td><b>{bn(r.score)}</b></td><td>{bn(r.correct)}/{bn(r.wrong)}</td><td>{fmtDuration(r.time_spent_sec)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
