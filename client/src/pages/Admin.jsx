import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useFetch, Loader, ErrorBox, Empty, Modal } from '../components/ui.jsx';
import { REPORT_REASONS } from '../components/QuestionTools.jsx';
import { bn, fmtDate, TRACKS } from '../utils.js';

export default function Admin() {
  const { user } = useAuth();
  const tabs = [['questions', '📝 প্রশ্নব্যাংক'], ...(user.role === 'admin' ? [['payments', 'পেমেন্ট']] : []), ['students', 'শিক্ষার্থী'], ['expert', 'লিখিত মূল্যায়ন'], ['prep', 'লিখিত/ভাইভা কনটেন্ট'], ['reports', 'রিপোর্ট'], ['quality', 'প্রশ্নের মান'], ['live', 'লাইভ এক্সাম'], ['ca', 'সাম্প্রতিক'], ['overview', 'সারসংক্ষেপ']];
  // Most visits are to manage questions, so the bank opens first.
  const [tab, setTab] = useState('questions');
  return (
    <div>
      <div className="page-head"><div><h1>🛠️ {user.role === 'admin' ? 'অ্যাডমিন প্যানেল' : 'শিক্ষক ড্যাশবোর্ড'}</h1><p>কনটেন্ট, মান নিয়ন্ত্রণ ও শিক্ষার্থী অগ্রগতি</p></div></div>
      <div className="tabs">{tabs.map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'overview' && <Overview />}
      {tab === 'payments' && <Payments />}
      {tab === 'expert' && <ExpertQueue />}
      {tab === 'prep' && <PrepContent />}
      {tab === 'students' && <Students />}
      {tab === 'questions' && <Questions />}
      {tab === 'reports' && <Reports />}
      {tab === 'quality' && <Quality />}
      {tab === 'live' && <LiveAdmin />}
      {tab === 'ca' && <CurrentAffairsAdmin />}
    </div>
  );
}

function Overview() {
  const { data, loading } = useFetch('/admin/overview');
  if (loading || !data) return <Loader />;
  const items = [['সক্রিয় প্রশ্ন', data.active_questions], ['পর্যালোচনাধীন', data.needs_review], ['খোলা রিপোর্ট', data.open_reports], ['মোট ব্যবহারকারী', data.users],
    ['দৈনিক সক্রিয়', data.dau], ['সাপ্তাহিক সক্রিয়', data.wau], ['জমা দেওয়া টেস্ট', data.attempts], ['মোট উত্তর', data.answers],
    ['যাচাইয়ের অপেক্ষায় পেমেন্ট', data.pending_payments], ['সক্রিয় সাবস্ক্রাইবার', data.active_subscribers], ['৩০ দিনের আয় (৳)', Number(data.revenue_30d)]];
  return <div className="grid g4">{items.map(([l, v]) => <div key={l} className="card stat"><span className="v">{bn(v)}</span><span className="l">{l}</span></div>)}</div>;
}

function Students() {
  const { data, loading, error } = useFetch('/admin/students');
  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  const s = data.summary;
  return (
    <div className="stack">
      <div className="grid g4">
        {[['শিক্ষার্থী', s.students], ['গত ৭ দিনে সক্রিয়', s.active_7d], ['গড় নির্ভুলতা', s.avg_accuracy != null ? `${bn(s.avg_accuracy)}%` : '—'], ['ঝুঁকিতে আছে', s.at_risk]].map(([l, v]) => <div key={l} className="card stat"><span className="v">{typeof v === 'number' ? bn(v) : v}</span><span className="l">{l}</span></div>)}
      </div>
      <div className="grid g-main">
        <div className="card table-wrap">
          <h3>শিক্ষার্থীদের অগ্রগতি</h3>
          <table className="table">
            <thead><tr><th>নাম</th><th>ট্র্যাক</th><th>টেস্ট</th><th>নির্ভুলতা</th><th>৭ দিনের পরিবর্তন</th><th>সতর্কতা</th></tr></thead>
            <tbody>{data.students.map((st) => (
              <tr key={st.id}>
                <td><b>{st.name}</b><div className="tiny muted">{st.institution || st.district || ''}</div></td>
                <td className="small">{TRACKS[st.track]?.bn}</td><td>{bn(st.tests)}</td><td>{st.accuracy != null ? `${bn(st.accuracy)}%` : '—'}</td>
                <td className={st.improvement > 0 ? 'tone-good' : st.improvement < 0 ? 'tone-bad' : ''}>{st.improvement != null ? `${st.improvement > 0 ? '+' : ''}${bn(st.improvement)}` : '—'}</td>
                <td>{st.risk.map((r) => <span key={r} className="badge bad" style={{ margin: 2 }}>{r}</span>)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="card">
          <h3>ক্লাসের দুর্বল টপিক</h3>
          {!data.weak_topics.length ? <p className="small muted">যথেষ্ট ডেটা নেই।</p> : data.weak_topics.map((t) => (
            <div key={t.topic + t.subject} className="row between small" style={{ padding: '.35rem 0', borderBottom: '1px dashed var(--line)' }}><span><b>{t.topic}</b> <span className="muted">· {t.subject}</span></span><span className="tone-bad">{bn(t.accuracy)}%</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

const EMPTY_Q = { subject_id: '', topic_id: '', body: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_option: 'a', explanation: '', difficulty: 3, source: '', exam_ref: '', year: '', status: 'active', change_note: '' };

function QuestionForm({ initial, onDone }) {
  const [f, setF] = useState({ ...EMPTY_Q, ...initial });
  const { data: subjects } = useFetch('/catalog/subjects');
  const { data: topics, reload: reloadTopics } = useFetch(f.subject_id ? `/catalog/subjects/${f.subject_id}/topics` : null, [f.subject_id]);
  const [err, setErr] = useState(null);
  const [newTopic, setNewTopic] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setErr(null);
    const body = { ...f, year: f.year || null };
    try { if (f.id) await api.put(`/admin/questions/${f.id}`, body); else await api.post('/admin/questions', body); onDone(); } catch (e) { setErr(e.message); }
  };
  const addTopic = async () => {
    const d = await api.post('/admin/topics', { subject_id: f.subject_id, name_bn: newTopic });
    setNewTopic(''); await reloadTopics(); setF((x) => ({ ...x, topic_id: d.id }));
  };
  return (
    <div>
      <ErrorBox error={err} />
      <div className="grid g2">
        <div className="field"><label>বিষয়</label><select className="input" value={f.subject_id} onChange={(e) => setF({ ...f, subject_id: e.target.value, topic_id: '' })}><option value="">—</option>{subjects?.map((s) => <option key={s.id} value={s.id}>{TRACKS[s.track].bn} · {s.name_bn}</option>)}</select></div>
        <div className="field"><label>টপিক</label><select className="input" value={f.topic_id} onChange={set('topic_id')}><option value="">—</option>{topics?.map((t) => <option key={t.id} value={t.id}>{t.name_bn}</option>)}</select>
          {f.subject_id && <div className="row"><input className="input" placeholder="নতুন টপিক" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} /><button type="button" className="btn light sm" disabled={!newTopic} onClick={addTopic}>যোগ</button></div>}
        </div>
      </div>
      <div className="field"><label>প্রশ্ন</label><textarea className="input" value={f.body} onChange={set('body')} /></div>
      <div className="grid g2">{['a', 'b', 'c', 'd'].map((l) => <div key={l} className="field"><label>অপশন {({ a: 'ক', b: 'খ', c: 'গ', d: 'ঘ' })[l]}</label><input className="input" value={f[`option_${l}`]} onChange={set(`option_${l}`)} /></div>)}</div>
      <div className="grid g4">
        <div className="field"><label>সঠিক উত্তর</label><select className="input" value={f.correct_option} onChange={set('correct_option')}>{['a', 'b', 'c', 'd'].map((l) => <option key={l} value={l}>{({ a: 'ক', b: 'খ', c: 'গ', d: 'ঘ' })[l]}</option>)}</select></div>
        <div className="field"><label>কঠিনতা (১-৫)</label><input type="number" min="1" max="5" className="input" value={f.difficulty} onChange={set('difficulty')} /></div>
        <div className="field"><label>সাল (PYQ)</label><input type="number" className="input" value={f.year || ''} onChange={set('year')} placeholder="যেমন 2023" /></div>
        <div className="field"><label>স্ট্যাটাস</label><select className="input" value={f.status} onChange={set('status')}><option value="active">সক্রিয়</option><option value="needs_review">পর্যালোচনাধীন</option><option value="retired">অবসরপ্রাপ্ত</option></select></div>
      </div>
      <div className="grid g2">
        <div className="field"><label>পরীক্ষার নাম (PYQ)</label><input className="input" value={f.exam_ref || ''} onChange={set('exam_ref')} placeholder="যেমন: ৪৫তম বিসিএস" /></div>
        <div className="field"><label>সূত্র</label><input className="input" value={f.source || ''} onChange={set('source')} /></div>
      </div>
      <div className="field"><label>ব্যাখ্যা</label><textarea className="input" value={f.explanation || ''} onChange={set('explanation')} /></div>
      {f.id && <div className="field"><label>সংশোধনের নোট (সংস্করণ ইতিহাসে দেখাবে)</label><input className="input" value={f.change_note} onChange={set('change_note')} /></div>}
      <button className="btn" onClick={save}>{f.id ? 'হালনাগাদ করুন (নতুন সংস্করণ)' : 'প্রশ্ন যোগ করুন'}</button>
    </div>
  );
}

function Questions() {
  const [q, setQ] = useState({ search: '', status: '', page: 1 });
  const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v)).toString();
  const { data, loading, reload } = useFetch(`/admin/questions?${qs}`, [qs]);
  const [edit, setEdit] = useState(null);
  const [bulk, setBulk] = useState(false);
  return (
    <div className="stack">
      <div className="row">
        <input className="input" style={{ maxWidth: 320 }} placeholder="প্রশ্ন খুঁজুন…" value={q.search} onChange={(e) => setQ({ ...q, search: e.target.value, page: 1 })} />
        <select className="input" style={{ width: 'auto' }} value={q.status} onChange={(e) => setQ({ ...q, status: e.target.value, page: 1 })}><option value="">সব স্ট্যাটাস</option><option value="active">সক্রিয়</option><option value="needs_review">পর্যালোচনাধীন</option><option value="retired">অবসরপ্রাপ্ত</option></select>
        <div className="spacer" />
        <button className="btn light" onClick={() => setBulk(true)}>JSON ইমপোর্ট</button>
        <button className="btn" onClick={() => setEdit({})}>+ নতুন প্রশ্ন</button>
      </div>
      <div className="card table-wrap">
        {loading && !data ? <Loader /> : (
          <table className="table">
            <thead><tr><th>#</th><th>প্রশ্ন</th><th>বিষয়/টপিক</th><th>উত্তর হার</th><th>স্ট্যাটাস</th><th /></tr></thead>
            <tbody>{data?.rows.map((r) => (
              <tr key={r.id}>
                <td>{bn(r.id)}</td><td className="small">{r.body}{r.year ? <span className="badge accent" style={{ marginLeft: 4 }}>{r.exam_ref || bn(r.year)}</span> : null}</td>
                <td className="small">{r.subject}<div className="tiny muted">{r.topic}</div></td>
                <td className="small">{r.attempt_count ? `${bn(Math.round((100 * r.correct_count) / r.attempt_count))}% (${bn(r.attempt_count)})` : '—'}</td>
                <td><span className={`badge ${r.status === 'active' ? 'good' : r.status === 'needs_review' ? 'mid' : 'gray'}`}>{r.status}</span> <span className="tiny muted">v{bn(r.version)}</span></td>
                <td><button className="btn light sm" onClick={() => setEdit(r)}>সম্পাদনা</button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {data && <div className="row between mt small"><span className="muted">মোট {bn(data.total)}টি</span>
          <div className="row"><button className="btn light sm" disabled={q.page <= 1} onClick={() => setQ({ ...q, page: q.page - 1 })}>←</button><span>পৃষ্ঠা {bn(q.page)}</span><button className="btn light sm" disabled={q.page * 25 >= data.total} onClick={() => setQ({ ...q, page: q.page + 1 })}>→</button></div></div>}
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `প্রশ্ন #${bn(edit.id)} সম্পাদনা` : 'নতুন প্রশ্ন'} wide>
        {edit && <QuestionForm initial={edit} onDone={() => { setEdit(null); reload(); }} />}
      </Modal>
      <Modal open={bulk} onClose={() => setBulk(false)} title="JSON থেকে প্রশ্ন ইমপোর্ট" wide>{bulk && <BulkImport onDone={reload} />}</Modal>
    </div>
  );
}

function BulkImport({ onDone }) {
  const sample = '[\n  {\n    "topic_id": 1,\n    "body": "প্রশ্ন…",\n    "option_a": "…", "option_b": "…", "option_c": "…", "option_d": "…",\n    "correct_option": "b",\n    "explanation": "…",\n    "difficulty": 3,\n    "year": 2023,\n    "exam_ref": "৪৫তম বিসিএস",\n    "source": "বিসিএস প্রশ্নপত্র"\n  }\n]';
  const [text, setText] = useState('');
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  const run = async () => {
    setErr(null); setRes(null);
    let list; try { list = JSON.parse(text); } catch { setErr('JSON সঠিক নয়'); return; }
    try { setRes(await api.post('/admin/questions/bulk', list)); onDone(); } catch (e) { setErr(e.message); }
  };
  return (
    <div>
      <p className="small muted">প্রতিটি প্রশ্নে topic_id (বিষয় স্বয়ংক্রিয়ভাবে নির্ধারিত হবে), প্রশ্ন, চারটি অপশন ও সঠিক উত্তর (a/b/c/d) দিন। বিগত বছরের প্রশ্নে year ও exam_ref দিলে "প্রশ্ন বিশ্লেষণ" পাতায় ফ্রিকোয়েন্সি দেখাবে।</p>
      <ErrorBox error={err} />
      {res && <div className="alert good">{bn(res.created)}টি প্রশ্ন যোগ হয়েছে।{res.errors.length ? ` ${bn(res.errors.length)}টিতে সমস্যা: ${res.errors.map((e) => `#${e.index}: ${e.error}`).join('; ')}` : ''}</div>}
      <textarea className="input" style={{ minHeight: 260, fontFamily: 'monospace', fontSize: '.85rem' }} placeholder={sample} value={text} onChange={(e) => setText(e.target.value)} />
      <button className="btn mt" onClick={run} disabled={!text.trim()}>ইমপোর্ট করুন</button>
    </div>
  );
}

function Reports() {
  const [status, setStatus] = useState('open');
  const { data, loading, reload } = useFetch(`/admin/reports?status=${status}`, [status]);
  const [notes, setNotes] = useState({});
  const [edit, setEdit] = useState(null);
  const resolve = async (r, s) => { await api.put(`/admin/reports/${r.id}`, { status: s, resolution_note: notes[r.id] || null }); reload(); };
  const openEdit = async (r) => setEdit(await api.get(`/admin/questions/${r.question_id}`));
  return (
    <div className="stack">
      <div className="alert small">পাইপলাইন: শিক্ষার্থীর রিপোর্ট → বিশেষজ্ঞ যাচাই → সংশোধন (নতুন সংস্করণ) → রিপোর্টকারী ফলাফল দেখতে পান। একই প্রশ্নে ৩ জন আলাদা শিক্ষার্থী রিপোর্ট করলে প্রশ্নটি স্বয়ংক্রিয়ভাবে সাময়িক বন্ধ হয়।</div>
      <div className="chips">{[['open', 'খোলা'], ['fixed', 'সংশোধিত'], ['verified_ok', 'সঠিক প্রমাণিত'], ['rejected', 'বাতিল']].map(([k, l]) => <button key={k} className={`chip ${status === k ? 'active' : ''}`} onClick={() => setStatus(k)}>{l}</button>)}</div>
      {loading && !data ? <Loader /> : !data?.length ? <div className="card"><Empty icon="✅" title="কোনো রিপোর্ট নেই" /></div> : data.map((r) => (
        <div key={r.id} className="card">
          <div className="row between"><span className="badge bad">{REPORT_REASONS[r.reason]}</span><span className="tiny muted">{r.reporter} · {fmtDate(r.created_at, true)} · এই প্রশ্নে খোলা রিপোর্ট {bn(r.open_for_question)}</span></div>
          <div className="qbody mt">{r.body}</div>
          <div className="small">{['a', 'b', 'c', 'd'].map((l) => <div key={l} className={l === r.correct_option ? 'tone-good' : ''}>{({ a: 'ক', b: 'খ', c: 'গ', d: 'ঘ' })[l]}. {r[`option_${l}`]} {l === r.correct_option && '✓'}</div>)}</div>
          {r.note && <div className="explain">শিক্ষার্থীর নোট: {r.note}</div>}
          {status === 'open' ? <>
            <input className="input mt" placeholder="সমাধানের নোট (শিক্ষার্থী দেখতে পাবেন)" value={notes[r.id] || ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
            <div className="row mt">
              <button className="btn light sm" onClick={() => openEdit(r)}>প্রশ্ন সম্পাদনা</button>
              <button className="btn sm" onClick={() => resolve(r, 'fixed')}>সংশোধিত হিসেবে বন্ধ করুন</button>
              <button className="btn ghost sm" onClick={() => resolve(r, 'verified_ok')}>প্রশ্ন সঠিক</button>
              <button className="btn light sm" onClick={() => resolve(r, 'rejected')}>বাতিল</button>
              <Link className="small" to={`/app/question/${r.question_id}`}>প্রশ্ন পাতা</Link>
            </div>
          </> : r.resolution_note && <div className="small muted mt">সমাধান: {r.resolution_note}</div>}
        </div>
      ))}
      <Modal open={!!edit} onClose={() => setEdit(null)} title="প্রশ্ন সংশোধন" wide>{edit && <QuestionForm initial={edit} onDone={() => { setEdit(null); reload(); }} />}</Modal>
    </div>
  );
}

function Quality() {
  const { data, loading } = useFetch('/admin/question-analytics?min=3');
  if (loading && !data) return <Loader />;
  return (
    <div className="card table-wrap">
      <h3>📊 প্রশ্ন বিশ্লেষণ — প্রশ্নব্যাংক নিজেই উন্নত হয়</h3>
      <p className="small muted">বিভাজন সূচক (discrimination) ঋণাত্মক হলে দুর্বল শিক্ষার্থীরা বেশি পারছে — উত্তর ভুল হতে পারে। বাস্তব কঠিনতা লেবেলের সাথে না মিললে লেবেল ঠিক করুন।</p>
      {!data?.length ? <Empty title="কমপক্ষে ৩ বার উত্তর দেওয়া প্রশ্ন নেই" /> : (
        <table className="table">
          <thead><tr><th>প্রশ্ন</th><th>উত্তর</th><th>সঠিক %</th><th>বাদ %</th><th>গড় সময়</th><th>কঠিনতা (লেবেল/বাস্তব)</th><th>বিভাজন</th><th>সাধারণ ভুল</th><th>সতর্কতা</th></tr></thead>
          <tbody>{data.map((q) => (
            <tr key={q.id}>
              <td className="small"><Link to={`/app/question/${q.id}`}>{q.body}</Link><div className="tiny muted">{q.topic}</div></td>
              <td>{bn(q.attempts)}</td><td>{bn(q.accuracy)}%</td><td>{bn(q.skip_rate)}%</td><td>{bn(q.avg_sec)} সে.</td>
              <td>{bn(q.difficulty)} / {bn(q.empirical_difficulty)}</td><td>{q.discrimination != null ? bn(q.discrimination) : '—'}</td>
              <td>{q.common_wrong ? ({ a: 'ক', b: 'খ', c: 'গ', d: 'ঘ' })[q.common_wrong] : '—'}</td>
              <td>{q.flags.map((f) => <span key={f} className="badge mid" style={{ margin: 2 }}>{f}</span>)}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}

function LiveAdmin() {
  const { data: exams } = useFetch('/catalog/exams');
  const { data: live, reload } = useFetch('/tests/live?all=1');
  const [f, setF] = useState({ title: '', exam_id: '', count: 50, starts_at: '', duration_min: 30, window_min: 120 });
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const create = async () => {
    setErr(null); setMsg(null);
    try { await api.post('/admin/live-tests', { ...f, starts_at: new Date(f.starts_at).toISOString() }); setMsg('লাইভ এক্সাম তৈরি হয়েছে'); reload(); } catch (e) { setErr(e.message); }
  };
  const remove = async (id) => { await api.del(`/admin/live-tests/${id}`); reload(); };
  return (
    <div className="grid g2">
      <div className="card">
        <h3>নতুন লাইভ এক্সাম</h3>
        {msg && <div className="alert good">{msg}</div>}<ErrorBox error={err} />
        <div className="field"><label>শিরোনাম</label><input className="input" value={f.title} onChange={set('title')} placeholder="যেমন: বিসিএস সাপ্তাহিক মডেল টেস্ট ১২" /></div>
        <div className="field"><label>পরীক্ষার প্যাটার্ন</label><select className="input" value={f.exam_id} onChange={set('exam_id')}><option value="">—</option>{exams?.map((e) => <option key={e.id} value={e.id}>{e.name_bn}</option>)}</select></div>
        <div className="grid g2">
          <div className="field"><label>প্রশ্নসংখ্যা</label><input type="number" className="input" value={f.count} onChange={set('count')} /></div>
          <div className="field"><label>সময় (মিনিট)</label><input type="number" className="input" value={f.duration_min} onChange={set('duration_min')} /></div>
          <div className="field"><label>শুরুর সময়</label><input type="datetime-local" className="input" value={f.starts_at} onChange={set('starts_at')} /></div>
          <div className="field"><label>অংশগ্রহণের সুযোগ (মিনিট)</label><input type="number" className="input" value={f.window_min} onChange={set('window_min')} /></div>
        </div>
        <p className="tiny muted">প্রশ্ন বাছাই হয় পরীক্ষার আসল বিষয়-বণ্টন অনুযায়ী। সময় শেষ হওয়ার পর উত্তর ও ব্যাখ্যা প্রকাশ পায়।</p>
        <button className="btn" onClick={create} disabled={!f.exam_id || !f.starts_at}>তৈরি করুন</button>
      </div>
      <div className="card">
        <h3>সব লাইভ এক্সাম</h3>
        {live?.map((t) => (
          <div key={t.id} className="row between small" style={{ padding: '.4rem 0', borderBottom: '1px dashed var(--line)' }}>
            <span><b>{t.title}</b><div className="tiny muted">{fmtDate(t.starts_at, true)} · {bn(t.participants)} জন · {t.state}</div></span>
            <button className="btn light sm" onClick={() => remove(t.id)}>মুছুন</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function CurrentAffairsAdmin() {
  const [f, setF] = useState({ title: '', category: 'বাংলাদেশ', summary: '', facts: '', published_on: '' });
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setErr(null); setMsg(null);
    try {
      const d = await api.post('/admin/current-affairs', { title: f.title, category: f.category, summary: f.summary, published_on: f.published_on || undefined, key_facts: f.facts.split('\n').map((x) => x.trim()).filter(Boolean) });
      setMsg(`সংরক্ষিত (ID ${d.id})। এখন প্রশ্নব্যাংকে প্রশ্ন যোগ করার সময় current_affair_id = ${d.id} দিন (JSON ইমপোর্টে) — সেগুলো দৈনিক কুইজে আসবে।`);
      setF({ ...f, title: '', summary: '', facts: '' });
    } catch (e) { setErr(e.message); }
  };
  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <h3>সাম্প্রতিক বিষয় যোগ করুন</h3>
      {msg && <div className="alert good">{msg}</div>}<ErrorBox error={err} />
      <div className="field"><label>শিরোনাম</label><input className="input" value={f.title} onChange={set('title')} /></div>
      <div className="grid g2">
        <div className="field"><label>ক্যাটাগরি</label><select className="input" value={f.category} onChange={set('category')}>{['বাংলাদেশ', 'আন্তর্জাতিক', 'অর্থনীতি', 'বিজ্ঞান ও প্রযুক্তি', 'পরিবেশ', 'খেলাধুলা', 'পুরস্কার', 'নিয়োগ', 'সংস্থা', 'চুক্তি'].map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="field"><label>তারিখ</label><input type="date" className="input" value={f.published_on} onChange={set('published_on')} /></div>
      </div>
      <div className="field"><label>ব্যাখ্যা/সারাংশ</label><textarea className="input" value={f.summary} onChange={set('summary')} /></div>
      <div className="field"><label>মূল তথ্য (প্রতি লাইনে একটি)</label><textarea className="input" value={f.facts} onChange={set('facts')} /></div>
      <button className="btn" onClick={save} disabled={!f.title || !f.summary}>প্রকাশ করুন</button>
    </div>
  );
}

const PAY_METHOD = { bkash_gateway: 'bKash গেটওয়ে', manual_bkash: 'bKash ম্যানুয়াল', manual_nagad: 'Nagad', manual_rocket: 'Rocket', demo: 'ডেমো' };

function Payments() {
  const [status, setStatus] = useState('pending');
  const { data, loading, reload } = useFetch(`/admin/payments?status=${status}`, [status]);
  const { data: plans, reload: reloadPlans } = useFetch('/admin/plans');
  const [notes, setNotes] = useState({});
  const [err, setErr] = useState(null);
  const act = async (p, action) => {
    setErr(null);
    try { await api.put(`/admin/payments/${p.id}`, { action, note: notes[p.id] || null }); reload(); } catch (e) { setErr(e.message); }
  };
  const savePlan = async (pl, patch) => { await api.put(`/admin/plans/${pl.code}`, { ...pl, ...patch }); reloadPlans(); };
  return (
    <div className="stack">
      <div className="alert small">ম্যানুয়াল পেমেন্ট: bKash/Nagad/Rocket মার্চেন্ট স্টেটমেন্টে TrxID, প্রেরকের নম্বর ও পরিমাণ মিলিয়ে তারপর অনুমোদন দিন। অনুমোদনের সঙ্গে সঙ্গে শিক্ষার্থীর পাস চালু হয়।</div>
      <ErrorBox error={err} />
      <div className="chips">{[['pending', 'অপেক্ষমাণ'], ['paid', 'সফল'], ['rejected', 'প্রত্যাখ্যাত'], ['refunded', 'ফেরত'], ['failed', 'ব্যর্থ']].map(([k, l]) => <button key={k} className={`chip ${status === k ? 'active' : ''}`} onClick={() => setStatus(k)}>{l}</button>)}</div>
      <div className="card table-wrap">
        {loading && !data ? <Loader /> : !data?.length ? <Empty icon="💳" title="কোনো পেমেন্ট নেই" /> : (
          <table className="table">
            <thead><tr><th>#</th><th>শিক্ষার্থী</th><th>প্যাকেজ</th><th>পরিমাণ</th><th>পদ্ধতি</th><th>TrxID / প্রেরক</th><th>সময়</th><th /></tr></thead>
            <tbody>{data.map((p) => (
              <tr key={p.id}>
                <td>{bn(p.id)}</td><td className="small"><b>{p.name}</b><div className="tiny muted">{p.phone || p.email}</div></td>
                <td className="small">{p.plan_name}</td><td>৳{bn(p.amount_bdt)}</td><td className="small">{PAY_METHOD[p.method]}</td>
                <td className="small"><code>{p.trx_id || '—'}</code><div className="tiny muted">{p.sender_number || ''}</div></td>
                <td className="small">{fmtDate(p.created_at, true)}</td>
                <td style={{ minWidth: 220 }}>
                  {(p.status === 'pending' || p.status === 'paid') && <input className="input" style={{ marginBottom: 4 }} placeholder="নোট (শিক্ষার্থী দেখবেন)" value={notes[p.id] || ''} onChange={(e) => setNotes({ ...notes, [p.id]: e.target.value })} />}
                  {p.status === 'pending' && <div className="row"><button className="btn sm" onClick={() => act(p, 'approve')}>অনুমোদন</button><button className="btn light sm" onClick={() => act(p, 'reject')}>প্রত্যাখ্যান</button></div>}
                  {p.status === 'paid' && p.method !== 'demo' && <button className="btn light sm" onClick={() => act(p, 'refund')}>রিফান্ড চিহ্নিত করুন</button>}
                  {p.admin_note && <div className="tiny muted">{p.admin_note}</div>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      <div className="card table-wrap">
        <h3>প্যাকেজ ও মূল্য</h3>
        <table className="table">
          <thead><tr><th>কোড</th><th>নাম</th><th>মূল্য (৳)</th><th>মেয়াদ (দিন)</th><th>চালু</th></tr></thead>
          <tbody>{plans?.map((pl) => (
            <tr key={pl.code}>
              <td className="small"><code>{pl.code}</code></td><td className="small">{pl.name_bn}</td>
              <td><input type="number" className="input" style={{ width: 100 }} defaultValue={pl.price_bdt} onBlur={(e) => Number(e.target.value) !== pl.price_bdt && savePlan(pl, { price_bdt: Number(e.target.value) })} /></td>
              <td><input type="number" className="input" style={{ width: 90 }} defaultValue={pl.duration_days} onBlur={(e) => Number(e.target.value) !== pl.duration_days && savePlan(pl, { duration_days: Number(e.target.value) })} /></td>
              <td><input type="checkbox" checked={!!pl.is_active} onChange={(e) => savePlan(pl, { is_active: e.target.checked ? 1 : 0 })} /></td>
            </tr>
          ))}</tbody>
        </table>
        <p className="tiny muted">মূল্য পরিবর্তন শুধু নতুন পেমেন্টে প্রযোজ্য। ঘরের বাইরে ক্লিক করলে সংরক্ষিত হয়।</p>
      </div>
    </div>
  );
}

function ExpertQueue() {
  const { data, loading, reload } = useFetch('/prep/expert/queue');
  const [open, setOpen] = useState(null);
  return (
    <div className="stack">
      <div className="alert small">শিক্ষার্থীরা যে লিখিত উত্তরে বিশেষজ্ঞ রিভিউ চেয়েছেন। আপনার নম্বরই চূড়ান্ত হিসেবে দেখানো হয় — রুব্রিক অনুযায়ী সুনির্দিষ্ট মতামত দিন।</div>
      <div className="card table-wrap">
        {loading && !data ? <Loader /> : !data?.length ? <Empty icon="✅" title="কোনো উত্তর অপেক্ষমাণ নেই" /> : (
          <table className="table">
            <thead><tr><th>#</th><th>প্রশ্ন</th><th>শিক্ষার্থী</th><th>শব্দ</th><th>স্বয়ংক্রিয় নম্বর</th><th>জমা</th><th /></tr></thead>
            <tbody>{data.map((w) => (
              <tr key={w.id}>
                <td>{bn(w.id)}</td><td className="small">{w.title}</td><td className="small">{w.name}</td><td>{bn(w.word_count)}</td>
                <td>{w.auto_score != null ? `${bn(Number(w.auto_score))}/${bn(w.marks)}` : '—'}</td><td className="small">{fmtDate(w.created_at, true)}</td>
                <td><button className="btn sm" onClick={() => setOpen(w.id)}>মূল্যায়ন করুন</button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      <Modal open={!!open} onClose={() => setOpen(null)} title="বিশেষজ্ঞ মূল্যায়ন" wide>{open && <ExpertGrade id={open} onDone={() => { setOpen(null); reload(); }} />}</Modal>
    </div>
  );
}

function ExpertGrade({ id, onDone }) {
  const { data: w, loading } = useFetch(`/prep/written/submissions/${id}`);
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [err, setErr] = useState(null);
  if (loading || !w) return <Loader />;
  const save = async () => {
    setErr(null);
    try { await api.post(`/prep/expert/${id}`, { score: Number(score), feedback }); onDone(); } catch (e) { setErr(e.message); }
  };
  return (
    <div>
      <p className="small"><b>{w.prompt.title}</b> — {w.prompt.prompt}</p>
      <div className="explain" style={{ whiteSpace: 'pre-wrap', maxHeight: 320, overflowY: 'auto' }}>{w.answer}</div>
      {w.auto_feedback && <p className="tiny muted mt">স্বয়ংক্রিয় মূল্যায়ন: {w.auto_feedback.criteria.map((c) => `${c.label.split(' ')[0]} ${c.score_pct == null ? '—' : `${bn(c.score_pct)}%`}`).join(' · ')}</p>}
      <ErrorBox error={err} />
      <div className="grid g2 mt">
        <div className="field"><label htmlFor="ex-s">নম্বর (০–{bn(w.prompt.marks)})</label><input id="ex-s" type="number" step="0.5" min="0" max={w.prompt.marks} className="input" value={score} onChange={(e) => setScore(e.target.value)} /></div>
        <div className="field"><label>রুব্রিক</label><div className="tiny muted">{w.prompt.rubric.map((c) => `${c.label} (${bn(Math.round(c.weight * 100))}%)`).join(' · ')}</div></div>
      </div>
      <div className="field"><label htmlFor="ex-f">মতামত — কী ভালো, কী ভুল, কীভাবে উন্নত করবে</label><textarea id="ex-f" className="input" style={{ minHeight: 140 }} value={feedback} onChange={(e) => setFeedback(e.target.value)} /></div>
      <button className="btn" onClick={save} disabled={score === '' || feedback.trim().length < 20}>চূড়ান্ত মূল্যায়ন জমা দিন</button>
    </div>
  );
}

const VIVA_CATS = { personal: 'ব্যক্তিগত পরিচিতি', motivation: 'ক্যাডার/পেশা পছন্দ', district: 'নিজ জেলা', bangladesh: 'বাংলাদেশ', liberation: 'মুক্তিযুদ্ধ', constitution: 'সংবিধান ও শাসনব্যবস্থা', current: 'সাম্প্রতিক বিষয়', international: 'আন্তর্জাতিক', subject: 'নিজ বিষয়', situational: 'পরিস্থিতিভিত্তিক' };
// "পয়েন্ট | কীওয়ার্ড১, কীওয়ার্ড২" per line → [{point, keywords}]
const parsePoints = (txt) => txt.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
  const [point, kw] = l.split('|').map((x) => x.trim());
  return { point, keywords: kw ? kw.split(',').map((k) => k.trim()).filter(Boolean) : [point] };
});

function PrepContent() {
  const { data: exams } = useFetch('/catalog/exams');
  const [w, setW] = useState({ track: 'job', exam_id: '', title: '', prompt: '', marks: 10, word_limit: 300, time_min: 20, points: '', model_answer: '', source: '' });
  const [v, setV] = useState({ category: 'bangladesh', question: '', guidance: '', points: '', follow_ups: '' });
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const saveW = async () => {
    setErr(null); setMsg(null);
    try { await api.post('/prep/admin/written-prompts', { ...w, exam_id: Number(w.exam_id) || null, key_points: parsePoints(w.points) }); setMsg('লিখিত প্রশ্ন যোগ হয়েছে'); setW({ ...w, title: '', prompt: '', points: '', model_answer: '' }); } catch (e) { setErr(e.message); }
  };
  const saveV = async () => {
    setErr(null); setMsg(null);
    try { await api.post('/prep/admin/viva-questions', { ...v, track: 'job', key_points: parsePoints(v.points), follow_ups: v.follow_ups.split('\n').map((x) => x.trim()).filter(Boolean) }); setMsg('ভাইভা প্রশ্ন যোগ হয়েছে'); setV({ ...v, question: '', guidance: '', points: '', follow_ups: '' }); } catch (e) { setErr(e.message); }
  };
  return (
    <div className="stack">
      {msg && <div className="alert good">{msg}</div>}<ErrorBox error={err} />
      <div className="grid g2">
        <div className="card">
          <h3>✍️ নতুন লিখিত প্রশ্ন</h3>
          <div className="grid g2">
            <div className="field"><label>ট্র্যাক</label><select className="input" value={w.track} onChange={(e) => setW({ ...w, track: e.target.value })}>{Object.entries(TRACKS).map(([k, t]) => <option key={k} value={k}>{t.bn}</option>)}</select></div>
            <div className="field"><label>পরীক্ষা</label><select className="input" value={w.exam_id} onChange={(e) => setW({ ...w, exam_id: e.target.value })}><option value="">—</option>{exams?.filter((e) => e.track === w.track).map((e) => <option key={e.id} value={e.id}>{e.name_bn}</option>)}</select></div>
          </div>
          <div className="field"><label>শিরোনাম</label><input className="input" value={w.title} onChange={(e) => setW({ ...w, title: e.target.value })} /></div>
          <div className="field"><label>প্রশ্ন</label><textarea className="input" value={w.prompt} onChange={(e) => setW({ ...w, prompt: e.target.value })} /></div>
          <div className="grid g3">
            <div className="field"><label>নম্বর</label><input type="number" className="input" value={w.marks} onChange={(e) => setW({ ...w, marks: e.target.value })} /></div>
            <div className="field"><label>শব্দসীমা</label><input type="number" className="input" value={w.word_limit} onChange={(e) => setW({ ...w, word_limit: e.target.value })} /></div>
            <div className="field"><label>সময় (মিনিট)</label><input type="number" className="input" value={w.time_min} onChange={(e) => setW({ ...w, time_min: e.target.value })} /></div>
          </div>
          <div className="field"><label>মূল পয়েন্ট (প্রতি লাইনে: পয়েন্ট | কীওয়ার্ড১, কীওয়ার্ড২)</label><textarea className="input" value={w.points} onChange={(e) => setW({ ...w, points: e.target.value })} placeholder="হুন্ডির সমস্যা | হুন্ডি, অবৈধ চ্যানেল" /></div>
          <div className="field"><label>আদর্শ উত্তরের কাঠামো</label><textarea className="input" value={w.model_answer} onChange={(e) => setW({ ...w, model_answer: e.target.value })} /></div>
          <div className="field"><label>সূত্র</label><input className="input" value={w.source} onChange={(e) => setW({ ...w, source: e.target.value })} /></div>
          <button className="btn" onClick={saveW} disabled={!w.title || !w.prompt}>যোগ করুন</button>
        </div>
        <div className="card">
          <h3>🎙️ নতুন ভাইভা প্রশ্ন</h3>
          <div className="field"><label>বিভাগ</label><select className="input" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>{Object.entries(VIVA_CATS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div className="field"><label>প্রশ্ন</label><textarea className="input" value={v.question} onChange={(e) => setV({ ...v, question: e.target.value })} /></div>
          <div className="field"><label>নির্দেশনা (বোর্ড কী খোঁজে)</label><textarea className="input" value={v.guidance} onChange={(e) => setV({ ...v, guidance: e.target.value })} /></div>
          <div className="field"><label>ভালো উত্তরের পয়েন্ট (পয়েন্ট | কীওয়ার্ড)</label><textarea className="input" value={v.points} onChange={(e) => setV({ ...v, points: e.target.value })} /></div>
          <div className="field"><label>পাল্টা প্রশ্ন (প্রতি লাইনে একটি)</label><textarea className="input" value={v.follow_ups} onChange={(e) => setV({ ...v, follow_ups: e.target.value })} /></div>
          <button className="btn" onClick={saveV} disabled={!v.question}>যোগ করুন</button>
        </div>
      </div>
    </div>
  );
}
