import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, bn, fmtTime, LETTER, store } from './lib.js';

const PER_Q = 30; // visual pacing only — answers are never cut off

export default function Play({ challenge }) {
  const { kind, id, code } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [quiz, setQuiz] = useState(null);
  const [err, setErr] = useState(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [secs, setSecs] = useState(0);
  const [qSecs, setQSecs] = useState(0);
  const [busy, setBusy] = useState(false);
  const started = useRef(0);

  useEffect(() => {
    const path = challenge ? `/challenge/${code}` : kind === 'daily' ? `/daily?track=${params.get('track') || store.get('quiz_track', 'job')}` : `/subject/${id}`;
    api(path).then((q) => { started.current = Date.now(); setQuiz(q); }).catch((e) => setErr(e.message));
  }, [challenge, code, kind, id, params]);

  useEffect(() => {
    if (!quiz) return;
    const t = setInterval(() => { setSecs(Math.round((Date.now() - started.current) / 1000)); setQSecs((s) => s + 1); }, 1000);
    return () => clearInterval(t);
  }, [quiz]);

  if (err) return <div className="stack"><div className="alert">{err}</div><Link className="btn light" to="/">হোমে ফিরুন</Link></div>;
  if (!quiz) return <div className="loader" aria-label="লোড হচ্ছে" />;
  if (!quiz.questions.length) return <div className="card">এই মুহূর্তে প্রশ্ন নেই। <Link to="/">হোমে ফিরুন</Link></div>;

  const q = quiz.questions[idx];
  const last = idx === quiz.questions.length - 1;
  const pick = (l) => setAnswers((a) => ({ ...a, [q.id]: l }));
  const next = () => { setIdx((i) => i + 1); setQSecs(0); };
  const finish = async () => {
    setBusy(true);
    try {
      const r = await api('/submit', { kind: quiz.kind, key: quiz.key, question_ids: quiz.questions.map((x) => x.id), answers, time_sec: secs, nickname: store.get('quiz_nick') });
      const result = { ...r, title: quiz.title, kind: quiz.kind, track: quiz.track, challenger: quiz.challenger || null };
      sessionStorage.setItem('quiz_result', JSON.stringify(result));
      nav('/result');
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <div className="stack">
      {quiz.challenger && idx === 0 && (
        <div className="card hero center"><b>⚔️ {quiz.challenger.name} পেয়েছেন {bn(quiz.challenger.score)}/{bn(quiz.challenger.total)}</b><div className="muted small">একই ১০টি প্রশ্ন — আপনি কি পারবেন?</div></div>
      )}
      <div className="row">
        <b>{quiz.title}</b><span className="spacer" />
        <span className={`timer ${qSecs > PER_Q ? 'low' : ''}`} aria-label="সময়">⏱ {fmtTime(secs)}</span>
      </div>
      <div className="progress" aria-label={`প্রশ্ন ${idx + 1} / ${quiz.questions.length}`}><span style={{ width: `${((idx + 1) / quiz.questions.length) * 100}%` }} /></div>
      <section className="card stack">
        <div className="small muted">প্রশ্ন {bn(idx + 1)}/{bn(quiz.questions.length)} · {q.subject}</div>
        <div className="q">{q.body}</div>
        <div className="opts">
          {['a', 'b', 'c', 'd'].map((l) => (
            <button key={l} className={`opt ${answers[q.id] === l ? 'sel' : ''}`} onClick={() => pick(l)} aria-pressed={answers[q.id] === l}>
              <span className="b">{LETTER[l]}</span>{q.options[l]}
            </button>
          ))}
        </div>
      </section>
      <div className="row">
        {idx > 0 && <button className="btn light" onClick={() => setIdx((i) => i - 1)}>← আগের</button>}
        <span className="spacer" />
        {!last && <button className="btn ghost" onClick={next}>{answers[q.id] ? 'পরের →' : 'বাদ দিন →'}</button>}
        {last && <button className="btn accent" onClick={finish} disabled={busy}>{busy ? 'ফলাফল তৈরি হচ্ছে…' : `জমা দিন (${bn(Object.keys(answers).length)}/${bn(quiz.questions.length)})`}</button>}
      </div>
    </div>
  );
}
