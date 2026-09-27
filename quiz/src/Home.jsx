import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, bn, LETTER, TRACKS, fmtTime, signupUrl, store } from './lib.js';

export default function Home() {
  const [track, setTrack] = useState(() => store.get('quiz_track', 'job'));
  const [tracks, setTracks] = useState(null);
  const [qotd, setQotd] = useState(null);
  const [qAns, setQAns] = useState(null);
  const [board, setBoard] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => { api('/tracks').then(setTracks).catch((e) => setErr(e.message)); }, []);
  useEffect(() => {
    store.set('quiz_track', track);
    setQotd(null); setQAns(null);
    api(`/qotd?track=${track}`).then((q) => { setQotd(q); if (q) setQAns(store.get(`qotd_${q.date}_${track}`)); }).catch(() => {});
    api(`/board?track=${track}`).then(setBoard).catch(() => {});
  }, [track]);

  const answer = async (l) => {
    if (qAns) return;
    try {
      const r = await api('/qotd/answer', { track, question_id: qotd.question.id, selected: l });
      const saved = { ...r, selected: l };
      setQAns(saved); store.set(`qotd_${qotd.date}_${track}`, saved);
    } catch (e) { setErr(e.message); }
  };
  const subjects = tracks?.find((t) => t.track === track)?.subjects || [];

  return (
    <div className="stack">
      <section className="card hero stack">
        <div>
          <span className="pill">প্রতিদিন নতুন · লগইন লাগবে না</span>
          <h1 style={{ fontSize: '1.9rem', marginTop: 10 }}>আজকের কুইজ — ১০ প্রশ্ন, ২ মিনিট</h1>
          <p className="muted">সারা দেশের পরীক্ষার্থীরা একই প্রশ্নে খেলছে। আপনি কত পাবেন?</p>
        </div>
        <div className="tracks" role="radiogroup" aria-label="ট্র্যাক">
          {Object.entries(TRACKS).map(([k, [i, l, d]]) => (
            <button key={k} role="radio" aria-checked={track === k} className={`track ${track === k ? 'on' : ''}`} onClick={() => setTrack(k)}>
              <span className="i">{i}</span><b>{l}</b><span className="small" style={{ opacity: .75 }}>{d}</span>
            </button>
          ))}
        </div>
        <Link className="btn accent block" style={{ fontSize: '1.1rem' }} to={`/play/daily?track=${track}`}>▶ আজকের কুইজ শুরু করুন</Link>
      </section>

      {err && <div className="alert">{err}</div>}

      {qotd && (
        <section className="card stack">
          <div className="row"><h2 style={{ margin: 0 }}>🧠 আজকের প্রশ্ন</h2><span className="spacer" />
            {qotd.stats.correct_pct != null && qAns && <span className="pill">{bn(qotd.stats.answered)} জনের {bn((qAns.stats || qotd.stats).correct_pct)}% সঠিক</span>}</div>
          <div className="q">{qotd.question.body}</div>
          <div className="opts">
            {['a', 'b', 'c', 'd'].map((l) => {
              const cls = !qAns ? '' : l === qAns.correct ? 'ok' : l === qAns.selected ? 'no' : '';
              return <button key={l} className={`opt ${cls}`} onClick={() => answer(l)} disabled={!!qAns}><span className="b">{LETTER[l]}</span>{qotd.question.options[l]}</button>;
            })}
          </div>
          {qAns && <div className="explain" aria-live="polite"><b>{qAns.is_correct ? '✓ সঠিক!' : '✗ হয়নি।'}</b> {qAns.explanation}</div>}
        </section>
      )}

      {subjects.length > 0 && (
        <section className="stack">
          <h2>📚 বিষয়ভিত্তিক কুইজ</h2>
          <div className="grid2">
            {subjects.map((s) => (
              <Link key={s.id} to={`/play/subject/${s.id}`} className="subject" style={{ textDecoration: 'none', color: 'inherit' }}>
                <b>{s.name_bn}</b><div className="small muted">১০টি এলোমেলো প্রশ্ন · {bn(s.questions)} প্রশ্নের ভাণ্ডার থেকে</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h2>🏆 আজকের সেরা</h2>
        {!board.length ? <p className="muted small">আজ এখনো কেউ নাম দিয়ে খেলেনি — প্রথম হোন!</p> : (
          <ol className="board">
            {board.map((b, i) => <li key={i}><span>{i < 3 ? ['🥇', '🥈', '🥉'][i] : bn(i + 1)}. {b.nickname}</span><span><b>{bn(b.score)}/{bn(b.total)}</b> <span className="muted small">{fmtTime(b.time_sec)}</span></span></li>)}
          </ol>
        )}
      </section>

      <section className="card center stack">
        <h2>শুধু কুইজ নয় — পূর্ণ প্রস্তুতি</h2>
        <p className="muted">আরোহণ আপনার দুর্বল টপিক খুঁজে বের করে, ভুলের কারণ বলে, আর প্রতিদিনের পরিকল্পনা বানিয়ে দেয়।</p>
        <a className="btn" href={signupUrl('home')}>ফ্রি অ্যাকাউন্ট খুলুন — ৭ দিনের ট্রায়াল</a>
      </section>
    </div>
  );
}
