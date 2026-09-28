import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, bn, fmtDate, fmtTime, num } from './lib.js';
import { QuestionView } from './ui.jsx';

export default function ExamResult() {
  const { code, token } = useParams();
  const { state } = useLocation();
  const [r, setR] = useState(null);
  const [board, setBoard] = useState(null);
  const [err, setErr] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const boardOnly = token === 'board';

  useEffect(() => {
    if (!boardOnly) api(`/forms/p/${code}/result/${token}`).then(setR).catch((e) => setErr(e.message));
    api(`/forms/p/${code}/leaderboard`).then(setBoard).catch(() => setBoard([]));
  }, [code, token, boardOnly]);

  if (err) return <div className="alert bad">{err}</div>;
  if (boardOnly) return <div className="stack"><Board rows={board} /><Link className="small" to={`/e/${code}`}>← পরীক্ষার পেজ</Link></div>;
  if (!r) return <div className="loader" />;
  if (r.status !== 'submitted') return <div className="card center empty"><h3>পরীক্ষা এখনো জমা হয়নি</h3><Link className="btn" to={`/e/${code}`}>পরীক্ষায় ফিরে যান</Link></div>;
  if (r.hidden) {
    return (
      <div className="card center empty">
        <div className="big-ico">✅</div><h2>জমা হয়েছে, {r.name}!</h2>
        <p className="muted">{r.show_result === 'after_end' ? `ফলাফল প্রকাশ হবে পরীক্ষা শেষ হওয়ার পর${r.ends_at ? ` (${fmtDate(r.ends_at)})` : ''} — এই পেজটি তখন আবার খুলুন।` : 'শিক্ষক ফলাফল জানিয়ে দেবেন।'}</p>
        <p className="tiny muted">এই পেজের লিংক সংরক্ষণ করে রাখুন।</p>
      </div>
    );
  }

  const pct = r.total_marks ? Math.max(0, (r.score / r.total_marks) * 100) : 0;
  const pass = r.pass_mark == null ? null : r.score >= r.pass_mark;
  const review = r.review || [];
  const shown = showAll ? review : review.filter((q) => q.state !== 'correct');
  const lost = r.wrong * r.negative_mark;

  return (
    <div className="stack">
      {state?.auto && <div className="alert mid">⏱ সময় শেষ — আপনার উত্তর নিজে থেকেই জমা হয়েছে।</div>}
      <div className="card center result-card">
        <div className="muted small">{r.title}</div>
        <h2>{r.name}</h2>
        <div className="ring" style={{ '--p': `${pct}%` }}><div><b>{num(r.score)}</b><span>/ {num(r.total_marks)}</span></div></div>
        {pass != null && <div className={`badge big ${pass ? 'good' : 'bad'}`}>{pass ? '🎉 পাস' : 'ফেল'} (পাস মার্ক {num(r.pass_mark)})</div>}
        <div className="facts">
          <div><b className="tone-good">{bn(r.correct)}</b><span>সঠিক</span></div>
          <div><b className="tone-bad">{bn(r.wrong)}</b><span>ভুল</span></div>
          <div><b>{bn(r.skipped)}</b><span>উত্তর দেননি</span></div>
          <div><b>{fmtTime(r.time_sec)}</b><span>সময়</span></div>
        </div>
        <div className="small">🏅 মেধাক্রম <b>{bn(r.rank)}</b> / {bn(r.participants)} জন{lost > 0 && <span className="muted"> · নেগেটিভে কাটা গেছে {num(lost)}</span>}</div>
      </div>

      {r.show_leaderboard && <Board rows={board} me={r.name} />}

      {!!review.length && (
        <div className="stack">
          <div className="row"><h3>উত্তর ও ব্যাখ্যা</h3><span className="spacer" />
            <div className="seg"><button className={!showAll ? 'on' : ''} onClick={() => setShowAll(false)}>ভুল ও বাদ ({bn(r.wrong + r.skipped)})</button><button className={showAll ? 'on' : ''} onClick={() => setShowAll(true)}>সব ({bn(review.length)})</button></div></div>
          {!shown.length && <div className="card center">🎯 সব উত্তর সঠিক!</div>}
          {shown.map((q) => (
            <div key={q.id} className={`card review ${q.state}`}>
              <div className="row tiny"><span className={`badge ${q.state === 'correct' ? 'good' : q.state === 'wrong' ? 'bad' : 'mid'}`}>{q.state === 'correct' ? '✓ সঠিক' : q.state === 'wrong' ? '✗ ভুল' : 'উত্তর দেননি'}</span>
                <span>{q.got > 0 ? '+' : ''}{num(q.got)} নম্বর</span></div>
              <QuestionView q={q} n={bn(review.indexOf(q) + 1)} given={q.given} showAnswer />
              {q.explanation && <div className="expl">💡 {q.explanation}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Board({ rows, me }) {
  if (!rows?.length) return null;
  return (
    <div className="card">
      <h3>🏆 মেধাতালিকা</h3>
      <ol className="board">{rows.map((x, i) => (
        <li key={i} className={x.name === me ? 'me' : ''}><span className="rk">{i < 3 ? ['🥇', '🥈', '🥉'][i] : bn(i + 1)}</span><span className="grow">{x.name}</span>
          <b>{num(x.score)}</b><span className="tiny muted">{fmtTime(x.time_sec)}</span></li>
      ))}</ol>
    </div>
  );
}
