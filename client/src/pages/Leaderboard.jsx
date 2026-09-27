import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useFetch, Loader, ErrorBox, Empty } from '../components/ui.jsx';
import { bn, TRACKS } from '../utils.js';

export default function Leaderboard() {
  const { user } = useAuth();
  const [scope, setScope] = useState('national');
  const [period, setPeriod] = useState('week');
  const { data, error, loading } = useFetch(`/leaderboard?scope=${scope}&period=${period}`, [scope, period]);
  const { data: districts } = useFetch('/leaderboard/districts');
  const needs = (scope === 'district' && !user.district) || (scope === 'institution' && !user.institution);

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>🏆 লিডারবোর্ড</h1><p>{TRACKS[user.track]?.bn} ট্র্যাক · র‍্যাংক হয় অর্জিত XP দিয়ে — অর্থাৎ নিয়মিত অনুশীলন ও সঠিক উত্তর, শুধু একটি টেস্ট নয়।</p></div>
        <div className="chips">
          {[['week', 'এই সপ্তাহ'], ['all', 'সর্বকালের']].map(([k, l]) => <button key={k} className={`chip ${period === k ? 'active' : ''}`} onClick={() => setPeriod(k)}>{l}</button>)}
        </div>
      </div>
      <div className="tabs">
        {[['national', '🇧🇩 জাতীয়'], ['district', `📍 জেলা${user.district ? ` (${user.district})` : ''}`], ['institution', `🏫 প্রতিষ্ঠান${user.institution ? ` (${user.institution})` : ''}`]].map(([k, l]) => (
          <button key={k} className={`tab ${scope === k ? 'active' : ''}`} onClick={() => setScope(k)}>{l}</button>
        ))}
      </div>
      <div className="grid g-main">
        <div className="card table-wrap">
          {needs ? <Empty icon="📝" title="প্রোফাইলে তথ্য যোগ করুন"><Link to="/app/profile">প্রোফাইলে জেলা/প্রতিষ্ঠান যোগ করুন</Link></Empty>
            : loading && !data ? <Loader /> : error ? <ErrorBox error={error} />
            : !data.rows.length ? <Empty title="এখনো কোনো র‍্যাংক নেই">টেস্ট দিয়ে প্রথম হোন!</Empty> : (
              <table className="table">
                <thead><tr><th>#</th><th>নাম</th><th className="hide-mobile">জেলা</th><th>XP</th><th>টেস্ট</th><th>নির্ভুলতা</th></tr></thead>
                <tbody>{data.rows.map((r) => (
                  <tr key={r.id} className={r.id === user.id ? 'me' : ''}>
                    <td>{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : bn(r.rank)}</td>
                    <td>{r.name}{r.streak >= 3 && <span className="tiny"> 🔥{bn(r.streak)}</span>}</td>
                    <td className="hide-mobile">{r.district || '—'}</td><td><b>{bn(r.xp)}</b></td><td>{bn(r.tests)}</td><td>{r.accuracy != null ? `${bn(r.accuracy)}%` : '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          {data && !data.me && !needs && data.rows.length > 0 && <p className="small muted mt">আপনি এখনো এই তালিকায় নেই — আজকের মিশন শেষ করুন!</p>}
        </div>
        <div className="card">
          <h3>🗺️ জেলা বনাম জেলা (এই সপ্তাহ)</h3>
          {!districts?.length ? <p className="small muted">এখনো ডেটা নেই।</p> : districts.map((d, i) => (
            <div key={d.district} className="row between small" style={{ padding: '.35rem 0', borderBottom: '1px dashed var(--line)' }}>
              <span>{bn(i + 1)}. <b>{d.district}</b> <span className="muted">· {bn(d.students)} জন</span></span><span>{bn(d.xp)} XP</span>
            </div>
          ))}
          <p className="tiny muted mt">গোপনীয়তা: প্রোফাইল থেকে লিডারবোর্ডে নিজের নাম লুকাতে পারেন।</p>
        </div>
      </div>
    </div>
  );
}
