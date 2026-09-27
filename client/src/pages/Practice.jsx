import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { useFetch, useStartTest, Loader, ErrorBox } from '../components/ui.jsx';
import { bn } from '../utils.js';

export default function Practice() {
  const { user } = useAuth();
  const { data: exam } = useFetch(user.target_exam_id ? `/catalog/exams/${user.target_exam_id}` : null);
  const { data: subjects, loading } = useFetch(user.target_exam_id ? `/catalog/subjects?exam_id=${user.target_exam_id}` : `/catalog/subjects?track=${user.track}`);
  const { start, busy, error } = useStartTest();
  const [open, setOpen] = useState(null);
  const [topics, setTopics] = useState({});
  const [picked, setPicked] = useState([]);
  const [count, setCount] = useState(20);
  const [timed, setTimed] = useState(false);
  const [pyqOnly, setPyqOnly] = useState(false);

  const toggleSubject = async (s) => {
    setOpen(open === s.id ? null : s.id);
    if (!topics[s.id]) setTopics({ ...topics, [s.id]: await api.get(`/catalog/subjects/${s.id}/topics`) });
  };
  const togglePick = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className="stack">
      <div className="page-head"><div><h1>অনুশীলন</h1><p>{exam ? `${exam.name_bn} সিলেবাস অনুযায়ী` : 'বিষয় ও টপিক বেছে নিন'}</p></div></div>
      <ErrorBox error={error} />

      <div className="grid g4">
        {[
          ['⚡', 'অ্যাডাপটিভ টেস্ট', 'আপনার দুর্বলতা অনুযায়ী ২০ প্রশ্ন', () => start('/tests/adaptive', { count: 20 }, 'ad')],
          ['🏛️', 'পূর্ণাঙ্গ মডেল টেস্ট', exam ? `${bn(exam.total_questions)} প্রশ্ন · ${bn(exam.duration_min)} মিনিট · আসল প্যাটার্ন` : 'আসল প্যাটার্ন', () => start('/tests/mock', {}, 'mk')],
          ['⏱️', 'মিনি মডেল টেস্ট', '২৫ প্রশ্ন, একই বিষয় বণ্টন', () => start('/tests/mock', { count: 25 }, 'mm')],
          ['🔥', 'কঠিন চ্যালেঞ্জ', 'শক্তিশালী টপিকে কঠিন প্রশ্ন', () => start('/tests/adaptive', { count: 20, focus: 'hard' }, 'hd')],
        ].map(([i, t, d, fn], k) => (
          <button key={t} className="card exam-tile" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={fn} disabled={!!busy}>
            <span style={{ fontSize: '1.6rem' }}>{i}</span><b>{busy === ['ad', 'mk', 'mm', 'hd'][k] ? 'তৈরি হচ্ছে…' : t}</b><span className="small muted">{d}</span>
          </button>
        ))}
      </div>

      <div className="card">
        <h3>📚 বিষয় ও টপিক বেছে অনুশীলন</h3>
        <p className="small muted">এক বা একাধিক টপিক বেছে নিন। "প্র্যাকটিস মোডে" প্রতিটি উত্তরের পরই সঠিক উত্তর ও ব্যাখ্যা দেখবেন; "পরীক্ষা মোডে" সময় ও নেগেটিভ মার্কিং থাকবে।</p>
        {loading ? <Loader /> : subjects?.map((s) => (
          <div key={s.id} style={{ borderBottom: '1px solid var(--line)' }}>
            <button className="row between" style={{ width: '100%', background: 'none', border: 0, padding: '.75rem .2rem', cursor: 'pointer', textAlign: 'left' }} onClick={() => toggleSubject(s)} aria-expanded={open === s.id}>
              <span><b>{s.name_bn}</b> <span className="small muted">· {bn(s.topic_count)} টপিক · {bn(s.question_count)} প্রশ্ন</span></span>
              <span>{open === s.id ? '▾' : '▸'}</span>
            </button>
            {open === s.id && (
              <div style={{ padding: '0 .2rem .9rem' }}>
                <div className="row mb">
                  <button className="btn ghost sm" disabled={!!busy} onClick={() => start('/tests/practice', { subjectId: s.id, count, timed, pyqOnly }, `s${s.id}`)}>পুরো বিষয় থেকে {bn(count)}টি</button>
                </div>
                <div className="chips">
                  {(topics[s.id] || []).map((t) => (
                    <button key={t.id} className={`chip ${picked.includes(t.id) ? 'active' : ''}`} onClick={() => togglePick(t.id)}>
                      {t.name_bn} <span className="tiny" style={{ opacity: .7 }}>({bn(t.question_count)}{Number(t.pyq_count) ? ` · PYQ ${bn(t.pyq_count)}` : ''})</span>
                    </button>
                  ))}
                  {!topics[s.id] && <span className="small muted">লোড হচ্ছে…</span>}
                </div>
              </div>
            )}
          </div>
        ))}
        <div className="row mt" style={{ gap: '1rem' }}>
          <label className="small">প্রশ্নসংখ্যা{' '}
            <select className="input" style={{ width: 'auto', display: 'inline-block' }} value={count} onChange={(e) => setCount(Number(e.target.value))}>{[10, 20, 30, 50].map((n) => <option key={n} value={n}>{bn(n)}</option>)}</select>
          </label>
          <div className="chips">
            <button className={`chip ${!timed ? 'active' : ''}`} onClick={() => setTimed(false)}>প্র্যাকটিস মোড</button>
            <button className={`chip ${timed ? 'active' : ''}`} onClick={() => setTimed(true)}>পরীক্ষা মোড</button>
          </div>
          <label className="small row" style={{ gap: '.3rem' }}><input type="checkbox" checked={pyqOnly} onChange={(e) => setPyqOnly(e.target.checked)} /> শুধু বিগত বছরের প্রশ্ন</label>
          <div className="spacer" />
          <button className="btn" disabled={!picked.length || !!busy} onClick={() => start('/tests/practice', { topicIds: picked, count, timed, pyqOnly }, 'pk')}>
            {busy === 'pk' ? 'তৈরি হচ্ছে…' : `নির্বাচিত ${bn(picked.length)}টি টপিকে শুরু করুন`}
          </button>
        </div>
      </div>
    </div>
  );
}
