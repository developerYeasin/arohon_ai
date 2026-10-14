// Question bank: search every active MCQ, browse past exam papers, and turn either into a quiz.
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useFetch, Loader, ErrorBox, Empty } from '../components/ui.jsx';
import { BookmarkButton } from '../components/QuestionTools.jsx';
import { bn } from '../utils.js';

const OPT = { a: 'ক', b: 'খ', c: 'গ', d: 'ঘ' };

function useQuiz() {
  const nav = useNavigate();
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const make = async (body, key) => {
    setBusy(key); setErr(null);
    try { const d = await api.post('/bank/test', body); nav(`/exam/${d.test_id}`); } catch (e) { setErr(e); } finally { setBusy(null); }
  };
  return { make, busy, err };
}

function QuestionCard({ q, i }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card">
      <div className="row between tiny"><span className="muted">{q.subject}{q.topic ? ` › ${q.topic}` : ''}</span>{q.exam_ref && <span className="badge gray">{q.exam_ref}</span>}</div>
      <b>{bn(i)}. {q.body}</b>
      <div className="grid g2 small mt">{['a', 'b', 'c', 'd'].map((k) => (
        <div key={k} className={open && k === q.correct_option ? 'tone-good' : ''}>{open && k === q.correct_option ? '✓ ' : ''}{OPT[k]}. {q[`option_${k}`]}</div>
      ))}</div>
      {open && q.explanation && <div className="explain small mt">{q.explanation}</div>}
      <div className="row mt">
        <button className="btn light sm" onClick={() => setOpen(!open)}>{open ? 'উত্তর লুকান' : 'উত্তর দেখুন'}</button>
        <BookmarkButton questionId={q.id} />
      </div>
    </div>
  );
}

function Search() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const [text, setText] = useState(q);
  const [subject, setSubject] = useState(params.get('subject_id') || '');
  const [pyq, setPyq] = useState(params.get('pyq') === '1');
  const [page, setPage] = useState(1);
  const { data: subjects } = useFetch('/catalog/subjects');
  const qs = new URLSearchParams({ q, page: String(page), ...(subject && { subject_id: subject }), ...(pyq && { pyq: '1' }) });
  const { data, error, loading } = useFetch(q.length >= 2 ? `/bank/search?${qs}` : null, [q, subject, pyq, page]);
  const { make, busy, err } = useQuiz();
  const submit = (e) => {
    e.preventDefault(); setPage(1);
    const n = new URLSearchParams(params); n.set('tab', 'search'); n.set('q', text.trim());
    subject ? n.set('subject_id', subject) : n.delete('subject_id');
    pyq ? n.set('pyq', '1') : n.delete('pyq');
    setParams(n);
  };
  return (
    <div className="stack">
      <form className="card stack" onSubmit={submit}>
        <div className="row">
          <input className="input" style={{ flex: 1, minWidth: 0 }} placeholder="শব্দ, টপিক বা প্রশ্নের অংশ লিখুন (যেমন: পদ্মা সেতু, সংবিধান)" value={text} onChange={(e) => setText(e.target.value)} aria-label="প্রশ্ন খুঁজুন" />
          <button className="btn" style={{ flexShrink: 0 }} disabled={text.trim().length < 2}>🔍 খুঁজুন</button>
        </div>
        <div className="row small">
          <select className="input" style={{ width: 'auto' }} value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="বিষয়">
            <option value="">সব বিষয়</option>{subjects?.map((s) => <option key={s.id} value={s.id}>{s.name_bn}</option>)}
          </select>
          <label className="row"><input type="checkbox" checked={pyq} onChange={(e) => setPyq(e.target.checked)} /> শুধু বিগত পরীক্ষার প্রশ্ন</label>
        </div>
      </form>
      <ErrorBox error={err} />
      {!q ? <div className="card"><Empty icon="🔎" title="যেকোনো শব্দ লিখে খুঁজুন">পুরো বাক্য না মিললে আলাদা আলাদা শব্দ ধরে কাছাকাছি প্রশ্ন দেখানো হবে।</Empty></div>
        : !data && !error ? <Loader /> : error ? <ErrorBox error={error} /> : !data.rows.length ? <div className="card"><Empty title="কিছু পাওয়া যায়নি">অন্য বানানে বা কম শব্দে চেষ্টা করুন।</Empty></div> : <>
          <div className="row between">
            <span className="small muted">{data.mode === 'words' ? 'হুবহু মিল পাওয়া যায়নি — কাছাকাছি প্রশ্ন দেখানো হচ্ছে' : `"${q}" — ফলাফল`}</span>
            <button className="btn accent sm" disabled={!!busy} onClick={() => make({ questionIds: data.rows.map((x) => x.id), title: q }, 'quiz')}>{busy === 'quiz' ? '…' : `এই ${bn(data.rows.length)}টি দিয়ে কুইজ`}</button>
          </div>
          {data.rows.map((x, i) => <QuestionCard key={x.id} q={x} i={(page - 1) * 20 + i + 1} />)}
          {data.mode === 'phrase' && (page > 1 || data.has_more) && (
            <div className="row" style={{ justifyContent: 'center' }}>
              <button className="btn light sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← আগের</button>
              <span className="small">পৃষ্ঠা {bn(page)}</span>
              <button className="btn light sm" disabled={!data.has_more} onClick={() => setPage(page + 1)}>পরের →</button>
            </div>
          )}
        </>}
    </div>
  );
}

function Papers() {
  const [text, setText] = useState('বিসিএস');
  const [q, setQ] = useState('বিসিএস');
  const { data, error, loading } = useFetch(`/bank/papers?q=${encodeURIComponent(q)}`, [q]);
  const { make, busy, err } = useQuiz();
  return (
    <div className="stack">
      <form className="card row" onSubmit={(e) => { e.preventDefault(); setQ(text.trim()); }}>
        <input className="input" style={{ flex: 1, minWidth: 0 }} placeholder="পরীক্ষার নাম (যেমন: বিসিএস, ব্যাংক, প্রাথমিক)" value={text} onChange={(e) => setText(e.target.value)} aria-label="প্রশ্নপত্র খুঁজুন" />
        <button className="btn" style={{ flexShrink: 0 }}>খুঁজুন</button>
      </form>
      <ErrorBox error={err} />
      {loading && !data ? <Loader /> : error ? <ErrorBox error={error} /> : !data.length ? <div className="card"><Empty title="প্রশ্নপত্র পাওয়া যায়নি" /></div> : (
        <div className="card table-wrap"><table className="table">
          <thead><tr><th>প্রশ্নপত্র</th><th>সাল</th><th>প্রশ্ন</th><th /></tr></thead>
          <tbody>{data.map((p) => (
            <tr key={p.exam_ref}>
              <td><b>{p.exam_ref}</b></td><td>{p.year ? bn(p.year) : '—'}</td><td>{bn(p.questions)}</td>
              <td className="row">
                <button className="btn sm" disabled={!!busy} onClick={() => make({ examRef: p.exam_ref, timed: true }, `t-${p.exam_ref}`)}>{busy === `t-${p.exam_ref}` ? '…' : '⏱ পরীক্ষা দিন'}</button>
                <button className="btn light sm" disabled={!!busy} onClick={() => make({ examRef: p.exam_ref, timed: false }, `p-${p.exam_ref}`)}>অনুশীলন</button>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

export default function QuestionBank() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'search';
  return (
    <div className="stack">
      <div className="page-head"><div><h1>🗄️ প্রশ্নভান্ডার</h1><p>সব প্রশ্ন এক জায়গায় — খুঁজুন, উত্তর দেখুন, বা বিগত পরীক্ষার পুরো প্রশ্নপত্রে পরীক্ষা দিন।</p></div></div>
      <div className="chips">
        {[['search', '🔎 স্মার্ট সার্চ'], ['papers', '📜 বিগত প্রশ্নপত্র']].map(([k, l]) => (
          <button key={k} className={`chip ${tab === k ? 'active' : ''}`} onClick={() => setParams({ tab: k })}>{l}</button>
        ))}
      </div>
      {tab === 'papers' ? <Papers /> : <Search />}
    </div>
  );
}
