import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { Loader, ErrorBox, Modal } from '../components/ui.jsx';
import { bn, fmtDuration } from '../utils.js';

const LETTERS = ['a', 'b', 'c', 'd'];
const BN_LETTER = { a: 'ক', b: 'খ', c: 'গ', d: 'ঘ' };
const CONF = [['sure', 'নিশ্চিত'], ['unsure', 'অনিশ্চিত'], ['guess', 'আন্দাজ']];
const startRequests = new Map();

export default function ExamPlayer() {
  const { testId } = useParams();
  const nav = useNavigate();
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [flags, setFlags] = useState({});
  const [feedback, setFeedback] = useState({});
  const [remaining, setRemaining] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const startedAt = useRef(Date.now());
  const qStart = useRef(Date.now());
  const answersRef = useRef({});
  const submittedRef = useRef(false);
  answersRef.current = answers;
  const storeKey = session ? `arohon_attempt_${session.attempt_id}` : null;

  useEffect(() => {
    // Share one in-flight request per test so a double-mounted effect can't open two attempts.
    if (!startRequests.has(testId)) {
      startRequests.set(testId, api.post(`/tests/${testId}/start`).finally(() => setTimeout(() => startRequests.delete(testId), 1000)));
    }
    startRequests.get(testId).then((d) => {
      if (d.already_submitted) { nav(`/app/result/${d.attempt_id}`, { replace: true }); return; }
      setSession(d);
      setRemaining(d.remaining_sec);
      try {
        const saved = JSON.parse(localStorage.getItem(`arohon_attempt_${d.attempt_id}`) || 'null');
        if (saved) { setAnswers(saved.answers || {}); setFlags(saved.flags || {}); setFeedback(saved.feedback || {}); }
      } catch { /* ignore */ }
    }).catch((e) => setError(e.message));
  }, [testId, nav]);

  useEffect(() => {
    if (storeKey) localStorage.setItem(storeKey, JSON.stringify({ answers, flags, feedback }));
  }, [storeKey, answers, flags, feedback]);

  // Accumulate time on the question being viewed.
  const commitTime = useCallback(() => {
    if (!session) return;
    const q = session.questions[idx];
    const dt = Date.now() - qStart.current;
    qStart.current = Date.now();
    setAnswers((a) => ({ ...a, [q.id]: { ...(a[q.id] || {}), time_ms: (a[q.id]?.time_ms || 0) + dt } }));
  }, [session, idx]);

  const goTo = useCallback((i) => {
    if (!session || i < 0 || i >= session.questions.length || i === idx) return;
    commitTime(); setIdx(i);
  }, [session, idx, commitTime]);

  const submit = useCallback(async () => {
    if (!session || submittedRef.current) return;
    submittedRef.current = true; setSubmitting(true);
    const q = session.questions[idx];
    const final = { ...answersRef.current };
    final[q.id] = { ...(final[q.id] || {}), time_ms: (final[q.id]?.time_ms || 0) + (Date.now() - qStart.current) };
    try {
      await api.post(`/attempts/${session.attempt_id}/submit`, {
        answers: session.questions.map((qq) => ({ question_id: qq.id, ...(final[qq.id] || {}) })),
      });
      localStorage.removeItem(storeKey);
      nav(`/app/result/${session.attempt_id}`, { replace: true });
    } catch (e) { setError(e.message); submittedRef.current = false; setSubmitting(false); }
  }, [session, idx, storeKey, nav]);

  // Clock: countdown for timed tests, stopwatch otherwise. Auto-submit at zero.
  useEffect(() => {
    if (!session) return;
    const t = setInterval(() => {
      setElapsed(Math.round((Date.now() - startedAt.current) / 1000));
      setRemaining((r) => (r == null ? r : Math.max(0, r - 1)));
    }, 1000);
    return () => clearInterval(t);
  }, [session]);
  useEffect(() => { if (remaining === 0) submit(); }, [remaining, submit]);

  const select = useCallback(async (q, letter) => {
    if (feedback[q.id]) return;
    const answeredAt = session.test.duration_sec ? session.test.duration_sec - (remaining ?? 0) : elapsed;
    setAnswers((a) => {
      const prev = a[q.id] || {};
      return { ...a, [q.id]: { ...prev, selected: prev.selected === letter && !session.test.instant_feedback ? null : letter, answered_at_sec: answeredAt, changed: prev.changed || (prev.selected && prev.selected !== letter) } };
    });
    if (session.test.instant_feedback) {
      try {
        const fb = await api.post(`/attempts/${session.attempt_id}/check`, { question_id: q.id, selected: letter });
        setFeedback((f) => ({ ...f, [q.id]: fb }));
      } catch (e) { setError(e.message); }
    }
  }, [feedback, session, remaining, elapsed]);

  const setConf = (q, c) => setAnswers((a) => ({ ...a, [q.id]: { ...(a[q.id] || {}), confidence: a[q.id]?.confidence === c ? null : c } }));

  useEffect(() => {
    const onKey = (e) => {
      if (!session || confirm || ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      const q = session.questions[idx];
      const k = e.key.toLowerCase();
      const map = { 1: 'a', 2: 'b', 3: 'c', 4: 'd', a: 'a', b: 'b', c: 'c', d: 'd' };
      if (map[k]) select(q, map[k]);
      else if (e.key === 'ArrowRight') goTo(idx + 1);
      else if (e.key === 'ArrowLeft') goTo(idx - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session, idx, confirm, select, goTo]);

  const counts = useMemo(() => {
    if (!session) return { answered: 0, total: 0 };
    const answered = session.questions.filter((q) => answers[q.id]?.selected).length;
    return { answered, total: session.questions.length, flagged: Object.values(flags).filter(Boolean).length };
  }, [session, answers, flags]);

  if (error && !session) return <div className="page"><ErrorBox error={error} /><Link to="/app" className="btn light">ড্যাশবোর্ডে ফিরুন</Link></div>;
  if (!session) return <Loader />;
  const { test, questions } = session;
  const q = questions[idx];
  const a = answers[q.id] || {};
  const fb = feedback[q.id];
  const timed = remaining != null;
  const meta = test.meta || {};

  return (
    <div className="exam-shell">
      <div className="exam-top">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{test.title}</div>
          <div className="tiny" style={{ color: '#b7bce6' }}>
            {bn(counts.answered)}/{bn(counts.total)} উত্তর · {Number(test.negative_mark) ? `প্রতি ভুলে −${bn(Number(test.negative_mark))}` : 'নেগেটিভ মার্কিং নেই'}
            {test.instant_feedback && ' · প্র্যাকটিস মোড (তাৎক্ষণিক উত্তর)'}
          </div>
        </div>
        <div className={`timer ${timed && remaining < 60 ? 'low' : ''}`} aria-live="off" title={timed ? 'অবশিষ্ট সময়' : 'অতিবাহিত সময়'}>{timed ? fmtDuration(remaining) : fmtDuration(elapsed)}</div>
        <button className="btn accent sm" onClick={() => { commitTime(); setConfirm(true); }} disabled={submitting}>জমা দিন</button>
      </div>

      {meta.challenger && (
        <div className="alert warn" style={{ margin: '1rem auto 0', maxWidth: 1180 }}>⚔️ {meta.challenger} এই টেস্টে পেয়েছেন {bn(meta.challenger_score)}/{bn(meta.total)} — আপনি কি হারাতে পারবেন?</div>
      )}
      {meta.plan && (
        <div className="alert" style={{ margin: '1rem auto 0', maxWidth: 1180 }}>🧩 সেশন পরিকল্পনা: {meta.plan.parts.map((p) => `${p.label} (${bn(p.count)})`).join(' + ')}</div>
      )}

      <div className="exam-body">
        <div>
          <ErrorBox error={error} />
          <div className="qcard current">
            <div className="qhead">
              <span className="qnum">{bn(idx + 1)}</span>
              <div style={{ flex: 1 }}>
                <div className="tiny muted">{q.subject} › {q.topic}{q.exam_ref ? ` · ${q.exam_ref}` : ''}</div>
                <div className="qbody">{q.body}</div>
              </div>
              <button className="btn light sm" onClick={() => setFlags((f) => ({ ...f, [q.id]: !f[q.id] }))} aria-pressed={!!flags[q.id]} title="পরে দেখার জন্য চিহ্নিত করুন">{flags[q.id] ? '🚩' : '⚐'}</button>
            </div>
            <div className="opts">
              {LETTERS.map((l) => {
                let cls = a.selected === l ? 'selected' : '';
                if (fb) cls = l === fb.correct ? 'correct' : a.selected === l ? 'wrong' : '';
                return (
                  <button key={l} className={`opt ${cls}`} onClick={() => select(q, l)} disabled={!!fb}>
                    <span className="bubble">{BN_LETTER[l]}</span><span>{q.options[l]}</span>
                  </button>
                );
              })}
            </div>
            {!fb && (
              <div className="conf">
                <span className="muted">আপনি কতটা নিশ্চিত?</span>
                {CONF.map(([k, label]) => <button key={k} className={a.confidence === k ? 'on' : ''} onClick={() => setConf(q, k)}>{label}</button>)}
              </div>
            )}
            {fb && (
              <div className="explain">
                <b className={fb.is_correct ? 'tone-good' : 'tone-bad'}>{fb.is_correct ? '✓ সঠিক!' : `✗ ভুল — সঠিক উত্তর: ${BN_LETTER[fb.correct]}`}</b>
                {fb.explanation && <div className="mt" style={{ marginTop: '.4rem' }}>{fb.explanation}</div>}
                {fb.source && <div className="tiny muted mt" style={{ marginTop: '.4rem' }}>সূত্র: {fb.source}</div>}
              </div>
            )}
          </div>
          <div className="row between">
            <button className="btn light" onClick={() => goTo(idx - 1)} disabled={idx === 0}>← আগের</button>
            <span className="tiny muted hide-mobile">কিবোর্ড: ১-৪ উত্তর, ←/→ প্রশ্ন বদল</span>
            {idx < questions.length - 1
              ? <button className="btn" onClick={() => goTo(idx + 1)}>পরের →</button>
              : <button className="btn accent" onClick={() => { commitTime(); setConfirm(true); }}>শেষ করুন ✓</button>}
          </div>
        </div>

        <aside className="omr-panel card">
          <div className="row between mb"><b>OMR শিট</b><span className="tiny muted">{bn(counts.answered)} উত্তর · {bn(counts.flagged)} 🚩</span></div>
          <div className="omr-grid">
            {questions.map((qq, i) => {
              const f = feedback[qq.id];
              const cls = f ? (f.is_correct ? 'ok' : 'no') : answers[qq.id]?.selected ? 'answered' : '';
              return <button key={qq.id} className={`omr-cell ${cls} ${flags[qq.id] ? 'flagged' : ''}`} style={i === idx ? { outline: '2px solid var(--navy)' } : null} onClick={() => goTo(i)} aria-label={`প্রশ্ন ${i + 1}`}>{bn(i + 1)}</button>;
            })}
          </div>
          <div className="tiny muted mt">নীল = উত্তর দেওয়া · কমলা দাগ = চিহ্নিত</div>
          <button className="btn accent block mt" onClick={() => { commitTime(); setConfirm(true); }} disabled={submitting}>পরীক্ষা জমা দিন</button>
        </aside>
      </div>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="পরীক্ষা জমা দেবেন?">
        <p>উত্তর দিয়েছেন <b>{bn(counts.answered)}</b>টি, বাকি <b>{bn(counts.total - counts.answered)}</b>টি{counts.flagged ? `, চিহ্নিত ${bn(counts.flagged)}টি` : ''}।</p>
        {Number(test.negative_mark) > 0 && <p className="small muted">মনে রাখুন: প্রতি ভুলে {bn(Number(test.negative_mark))} নম্বর কাটা যাবে; উত্তর না দিলে কাটা যাবে না।</p>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn light" onClick={() => setConfirm(false)}>ফিরে যান</button>
          <button className="btn accent" onClick={submit} disabled={submitting}>{submitting ? 'জমা হচ্ছে…' : 'হ্যাঁ, জমা দিন'}</button>
        </div>
      </Modal>
    </div>
  );
}
