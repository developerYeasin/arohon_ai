import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useFetch, Loader, ErrorBox, Empty, Modal } from '../components/ui.jsx';
import { REPORT_REASONS } from '../components/QuestionTools.jsx';
import { bn, fmtDate, TRACKS } from '../utils.js';

// Staff navigation. `roles` controls who sees each section; the layout builds its menu from this.
export const STAFF_SECTIONS = [
  { group: null, items: [{ key: 'overview', icon: '📊', label: 'ড্যাশবোর্ড', roles: ['admin', 'teacher'] }] },
  { group: 'কনটেন্ট', items: [
    { key: 'questions', icon: '📝', label: 'প্রশ্নব্যাংক', roles: ['admin', 'teacher'] },
    { key: 'prep', icon: '✍️', label: 'লিখিত ও ভাইভা কনটেন্ট', roles: ['admin', 'teacher'] },
    { key: 'live', icon: '🔴', label: 'লাইভ এক্সাম', roles: ['admin', 'teacher'] },
    { key: 'ca', icon: '📰', label: 'সাম্প্রতিক বিষয়াবলি', roles: ['admin', 'teacher'] },
  ] },
  { group: 'মান নিয়ন্ত্রণ', items: [
    { key: 'reports', icon: '⚠️', label: 'ভুল প্রশ্নের রিপোর্ট', roles: ['admin', 'teacher'] },
    { key: 'quality', icon: '🔬', label: 'প্রশ্নের মান বিশ্লেষণ', roles: ['admin'] },
  ] },
  { group: 'শিক্ষার্থী', items: [
    { key: 'students', icon: '👩‍🎓', label: 'শিক্ষার্থীদের অগ্রগতি', roles: ['admin', 'teacher'] },
    { key: 'expert', icon: '🎓', label: 'লিখিত উত্তর মূল্যায়ন', roles: ['admin', 'teacher'] },
    { key: 'groups', icon: '👥', label: 'আমার ব্যাচ', roles: ['teacher'], href: '/admin/groups' },
  ] },
  { group: 'ব্যবসা ও অ্যাকাউন্ট', items: [
    { key: 'users', icon: '👤', label: 'ব্যবহারকারী ও role', roles: ['admin'] },
    { key: 'market', icon: '🛒', label: 'মার্কেটপ্লেস ও ক্রিয়েটর', roles: ['admin'] },
    { key: 'payments', icon: '💳', label: 'পেমেন্ট ও প্যাকেজ', roles: ['admin'] },
  ] },
];
const PANELS = {
  overview: () => <Overview />, questions: () => <Questions />, prep: () => <PrepContent />, live: () => <LiveAdmin />, ca: () => <CurrentAffairsAdmin />,
  reports: () => <Reports />, quality: () => <Quality />, students: () => <Students />, expert: () => <ExpertQueue />, payments: () => <Payments />, users: () => <Users />, market: () => <MarketAdmin />,
};

export default function Admin() {
  const { user } = useAuth();
  const { section = 'overview' } = useParams();
  const item = STAFF_SECTIONS.flatMap((g) => g.items).find((i) => i.key === section);
  if (!item || !item.roles.includes(user.role) || !PANELS[section]) return <Navigate to="/admin" replace />;
  return (
    <div>
      <div className="page-head"><div><h1>{item.icon} {item.label}</h1></div></div>
      {PANELS[section]()}
    </div>
  );
}

// Landing page for staff: what needs attention today, then the numbers.
function Overview() {
  const { user } = useAuth();
  const { data, loading } = useFetch('/admin/overview');
  const { data: queue } = useFetch('/prep/expert/queue');
  if (loading || !data) return <Loader />;
  const admin = user.role === 'admin';
  const todo = [
    [data.open_reports, 'টি প্রশ্নে শিক্ষার্থীরা ভুল রিপোর্ট করেছে', 'reports'],
    [data.needs_review, 'টি প্রশ্ন সাময়িক বন্ধ — পর্যালোচনা দরকার', 'questions'],
    [queue?.length || 0, 'টি লিখিত উত্তর বিশেষজ্ঞ মূল্যায়নের অপেক্ষায়', 'expert'],
    ...(admin ? [[data.pending_payments, 'টি ম্যানুয়াল পেমেন্ট যাচাইয়ের অপেক্ষায়', 'payments']] : []),
  ].filter(([n]) => n > 0);
  const stats = [['সক্রিয় প্রশ্ন', data.active_questions], ['মোট ব্যবহারকারী', data.users], ['আজ সক্রিয়', data.dau], ['এই সপ্তাহে সক্রিয়', data.wau],
    ['জমা দেওয়া টেস্ট', data.attempts], ['মোট উত্তর', data.answers],
    ...(admin ? [['সক্রিয় সাবস্ক্রাইবার', data.active_subscribers], ['৩০ দিনের আয় (৳)', Number(data.revenue_30d)]] : [])];
  return (
    <div className="stack">
      <div className="card">
        <h3>✅ আজকের করণীয়</h3>
        {!todo.length ? <p className="muted small" style={{ margin: 0 }}>সব কাজ হালনাগাদ — অপেক্ষমাণ কিছু নেই।</p> : todo.map(([n, t, k]) => (
          <div key={k} className="row between" style={{ padding: '.45rem 0', borderBottom: '1px dashed var(--line)' }}>
            <span><b>{bn(n)}</b>{t}</span><Link className="btn sm" to={`/admin/${k}`}>দেখুন</Link>
          </div>
        ))}
      </div>
      <div className="grid g4">{stats.map(([l, v]) => <div key={l} className="card stat"><span className="v">{bn(v)}</span><span className="l">{l}</span></div>)}</div>
      <div className="card row">
        <b>দ্রুত কাজ:</b>
        <Link className="btn sm" to="/admin/questions">+ নতুন প্রশ্ন</Link>
        <Link className="btn ghost sm" to="/admin/live">লাইভ এক্সাম তৈরি</Link>
        <Link className="btn ghost sm" to="/admin/ca">সাম্প্রতিক বিষয় যোগ</Link>
      </div>
    </div>
  );
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
              <Link className="small" to={`/admin/question/${r.question_id}`}>প্রশ্ন পাতা</Link>
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
              <td className="small"><Link to={`/admin/question/${q.id}`}>{q.body}</Link><div className="tiny muted">{q.topic}</div></td>
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

const ROLE_BN = { student: 'শিক্ষার্থী', teacher: 'শিক্ষক', admin: 'অ্যাডমিন' };

function Users() {
  const { user: me } = useAuth();
  const [q, setQ] = useState({ search: '', role: '', page: 1 });
  const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v)).toString();
  const { data, loading, reload } = useFetch(`/admin/users?${qs}`, [qs]);
  const [create, setCreate] = useState(false);
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const act = async (u, patch, done) => {
    setErr(null); setMsg(null);
    try { await api.put(`/admin/users/${u.id}`, patch); setMsg(done); reload(); } catch (e) { setErr(e.message); }
  };
  return (
    <div className="stack">
      {msg && <div className="alert good">{msg}</div>}<ErrorBox error={err} />
      <div className="row">
        <input className="input" style={{ maxWidth: 280 }} placeholder="নাম, ইমেইল বা মোবাইল…" value={q.search} onChange={(e) => setQ({ ...q, search: e.target.value, page: 1 })} />
        <div className="chips">{[['', 'সবাই'], ['student', 'শিক্ষার্থী'], ['teacher', 'শিক্ষক'], ['admin', 'অ্যাডমিন']].map(([k, l]) => <button key={k} className={`chip ${q.role === k ? 'active' : ''}`} onClick={() => setQ({ ...q, role: k, page: 1 })}>{l}</button>)}</div>
        <div className="spacer" />
        <button className="btn" onClick={() => setCreate(true)}>+ নতুন শিক্ষক/অ্যাডমিন</button>
      </div>
      <div className="card table-wrap">
        {loading && !data ? <Loader /> : !data?.rows.length ? <Empty title="কেউ পাওয়া যায়নি" /> : (
          <table className="table">
            <thead><tr><th>নাম</th><th>যোগাযোগ</th><th>role</th><th>পাস</th><th>শেষ সক্রিয়</th><th>অবস্থা</th><th /></tr></thead>
            <tbody>{data.rows.map((u) => (
              <tr key={u.id} style={u.is_active ? null : { opacity: 0.55 }}>
                <td><b>{u.name}</b>{u.id === me.id && <span className="badge" style={{ marginLeft: 4 }}>আপনি</span>}<div className="tiny muted">{u.institution || u.district || ''}</div></td>
                <td className="small">{u.email || u.phone}</td>
                <td>
                  <select className="input" style={{ width: 'auto', padding: '.3rem .5rem' }} value={u.role} disabled={u.id === me.id}
                    onChange={(e) => act(u, { role: e.target.value }, `${u.name} এখন ${ROLE_BN[e.target.value]}`)}>
                    {Object.entries(ROLE_BN).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </td>
                <td className="small">{u.pass_until ? `${fmtDate(u.pass_until)} পর্যন্ত` : u.trial_ends_at && new Date(u.trial_ends_at) > new Date() ? 'ট্রায়াল' : '—'}</td>
                <td className="small">{u.last_active_date ? fmtDate(u.last_active_date) : '—'}</td>
                <td>{u.is_active ? <span className="badge good">সক্রিয়</span> : <span className="badge bad">বন্ধ</span>}</td>
                <td><button className="btn light sm" onClick={() => setEdit(u)}>আরও</button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {data && <div className="row between mt small"><span className="muted">মোট {bn(data.total)} জন</span>
          <div className="row"><button className="btn light sm" disabled={q.page <= 1} onClick={() => setQ({ ...q, page: q.page - 1 })}>←</button><span>পৃষ্ঠা {bn(q.page)}</span><button className="btn light sm" disabled={q.page * 30 >= data.total} onClick={() => setQ({ ...q, page: q.page + 1 })}>→</button></div></div>}
      </div>
      <Modal open={create} onClose={() => setCreate(false)} title="নতুন অ্যাকাউন্ট">{create && <CreateUser onDone={(m) => { setCreate(false); setMsg(m); reload(); }} />}</Modal>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.name || ''}>{edit && <UserActions u={edit} self={edit.id === me.id} onDone={(m) => { setEdit(null); setMsg(m); reload(); }} />}</Modal>
    </div>
  );
}

function CreateUser({ onDone }) {
  const [f, setF] = useState({ name: '', login: '', password: '', role: 'teacher', institution: '' });
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setErr(null);
    const id = f.login.trim();
    const isPhone = /^\+?[0-9]{10,14}$/.test(id);
    try {
      await api.post('/admin/users', { name: f.name, password: f.password, role: f.role, institution: f.institution || null, ...(isPhone ? { phone: id } : { email: id }) });
      onDone(`${f.name}-এর ${ROLE_BN[f.role]} অ্যাকাউন্ট তৈরি হয়েছে। লগইন তথ্য নিরাপদে তাঁকে পাঠান।`);
    } catch (e) { setErr(e.message); }
  };
  return (
    <div>
      <ErrorBox error={err} />
      <div className="chips mb">{['teacher', 'admin', 'student'].map((r) => <button key={r} className={`chip ${f.role === r ? 'active' : ''}`} onClick={() => setF({ ...f, role: r })}>{ROLE_BN[r]}</button>)}</div>
      <div className="field"><label>নাম</label><input className="input" value={f.name} onChange={set('name')} /></div>
      <div className="field"><label>ইমেইল অথবা মোবাইল</label><input className="input" value={f.login} onChange={set('login')} /></div>
      <div className="field"><label>প্রাথমিক পাসওয়ার্ড</label><input className="input" value={f.password} onChange={set('password')} /><small>প্রথম লগইনের পর প্রোফাইল থেকে বদলে নিতে বলুন।</small></div>
      <div className="field"><label>প্রতিষ্ঠান (শিক্ষকের জন্য)</label><input className="input" value={f.institution} onChange={set('institution')} placeholder="এই প্রতিষ্ঠানের শিক্ষার্থীরা শিক্ষকের তালিকায় দেখাবে" /></div>
      <button className="btn block" onClick={save} disabled={!f.name || !f.login || f.password.length < 6}>তৈরি করুন</button>
    </div>
  );
}

function UserActions({ u, self, onDone }) {
  const [days, setDays] = useState(30);
  const [pw, setPw] = useState('');
  const [inst, setInst] = useState(u.institution || '');
  const [err, setErr] = useState(null);
  const run = async (fn, m) => { setErr(null); try { await fn(); onDone(m); } catch (e) { setErr(e.message); } };
  return (
    <div className="stack">
      <ErrorBox error={err} />
      <div className="small muted">{u.email || u.phone} · {ROLE_BN[u.role]} · যোগ দিয়েছেন {fmtDate(u.created_at)}</div>
      <div className="card flat">
        <b className="small">🎁 কমপ্লিমেন্টারি পাস দিন</b>
        <p className="tiny muted">বৃত্তি, প্রতিযোগিতার পুরস্কার বা সমস্যার ক্ষতিপূরণের জন্য। বর্তমান মেয়াদের সাথে যোগ হবে।</p>
        <div className="row"><input type="number" className="input" style={{ width: 100 }} value={days} onChange={(e) => setDays(Number(e.target.value))} /><span className="small">দিন</span>
          <button className="btn sm" onClick={() => run(() => api.put(`/admin/users/${u.id}`, { grant_days: days }), `${u.name}-কে ${days} দিনের পাস দেওয়া হয়েছে`)}>দিন</button></div>
      </div>
      <div className="card flat">
        <b className="small">🏫 প্রতিষ্ঠান</b>
        <div className="row"><input className="input" style={{ flex: 1 }} value={inst} onChange={(e) => setInst(e.target.value)} />
          <button className="btn sm" onClick={() => run(() => api.put(`/admin/users/${u.id}`, { institution: inst }), 'প্রতিষ্ঠান হালনাগাদ হয়েছে')}>সংরক্ষণ</button></div>
      </div>
      <div className="card flat">
        <b className="small">🔑 পাসওয়ার্ড রিসেট</b>
        <div className="row"><input className="input" style={{ flex: 1 }} placeholder="নতুন পাসওয়ার্ড" value={pw} onChange={(e) => setPw(e.target.value)} />
          <button className="btn sm" disabled={pw.length < 6} onClick={() => run(() => api.post(`/admin/users/${u.id}/reset-password`, { password: pw }), 'পাসওয়ার্ড বদলানো হয়েছে — নতুন পাসওয়ার্ড ব্যবহারকারীকে জানান')}>বদলান</button></div>
      </div>
      {!self && (u.is_active
        ? <button className="btn danger" onClick={() => run(() => api.put(`/admin/users/${u.id}`, { is_active: 0 }), `${u.name}-এর অ্যাকাউন্ট বন্ধ করা হয়েছে`)}>অ্যাকাউন্ট বন্ধ করুন</button>
        : <button className="btn" onClick={() => run(() => api.put(`/admin/users/${u.id}`, { is_active: 1 }), `${u.name}-এর অ্যাকাউন্ট আবার চালু হয়েছে`)}>অ্যাকাউন্ট চালু করুন</button>)}
    </div>
  );
}

const CREATOR_STATUS = { pending: ['অপেক্ষমাণ', 'mid'], approved: ['অনুমোদিত', 'good'], rejected: ['প্রত্যাখ্যাত', 'bad'] };

function MarketAdmin() {
  const [tab, setTab] = useState('review');
  return (
    <div className="stack">
      <div className="chips">{[['review', 'পর্যালোচনার অপেক্ষায় সেট'], ['creators', 'ক্রিয়েটর']].map(([k, l]) => <button key={k} className={`chip ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'review' ? <ProductReview /> : <Creators />}
    </div>
  );
}

function ProductReview() {
  const { data, loading, reload } = useFetch('/market/admin/review');
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState(null);
  const { data: qs } = useFetch(open ? `/market/creator/products/${open.id}/questions` : null, [open?.id]);
  const act = async (action) => {
    setErr(null);
    try { await api.put(`/market/admin/products/${open.id}`, { action, admin_note: note }); setOpen(null); setNote(''); reload(); } catch (e) { setErr(e.message); }
  };
  if (loading && !data) return <Loader />;
  return (
    <div className="card table-wrap">
      <p className="small muted">প্রকাশের আগে প্রশ্নের নির্ভুলতা, ব্যাখ্যার মান ও কপিরাইট যাচাই করুন। অনুমোদিত সেট সঙ্গে সঙ্গে মার্কেটপ্লেসে দেখাবে।</p>
      {!data?.length ? <Empty icon="✅" title="পর্যালোচনার অপেক্ষায় কোনো সেট নেই" /> : (
        <table className="table"><thead><tr><th>শিরোনাম</th><th>ক্রিয়েটর</th><th>প্রশ্ন</th><th>মূল্য</th><th /></tr></thead>
          <tbody>{data.map((p) => (
            <tr key={p.id}><td><b>{p.title}</b></td><td className="small">{p.creator}</td><td>{bn(p.questions)}</td><td>{p.price_bdt ? `৳${bn(p.price_bdt)}` : 'ফ্রি'}</td>
              <td><button className="btn sm" onClick={() => setOpen(p)}>যাচাই করুন</button></td></tr>
          ))}</tbody></table>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.title || ''} wide>
        {open && <div className="stack">
          <ErrorBox error={err} />
          <p className="small">{open.description}</p>
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {!qs ? <Loader /> : qs.map((q, i) => (
              <div key={q.id} style={{ padding: '.5rem 0', borderBottom: '1px dashed var(--line)' }}>
                <b className="small">{bn(i + 1)}. {q.body}</b>
                <div className="tiny">{['a', 'b', 'c', 'd'].map((l) => <span key={l} className={l === q.correct_option ? 'tone-good' : ''} style={{ marginRight: 10 }}>{({ a: 'ক', b: 'খ', c: 'গ', d: 'ঘ' })[l]}) {q[`option_${l}`]}{l === q.correct_option ? ' ✓' : ''}</span>)}</div>
                <div className="tiny muted">{q.explanation}</div>
              </div>
            ))}
          </div>
          <input className="input" placeholder="ক্রিয়েটরের জন্য মন্তব্য (প্রত্যাখ্যানে কী ঠিক করতে হবে)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="row"><button className="btn" onClick={() => act('publish')}>✓ প্রকাশ করুন</button><button className="btn light" onClick={() => act('reject')}>সংশোধনের জন্য ফেরত</button></div>
        </div>}
      </Modal>
    </div>
  );
}

function Creators() {
  const { data, loading, reload } = useFetch('/market/admin/creators');
  const [pay, setPay] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const run = async (fn, m) => { setErr(null); setMsg(null); try { await fn(); setMsg(m); reload(); } catch (e) { setErr(e.message); } };
  if (loading && !data) return <Loader />;
  return (
    <div className="stack">
      {msg && <div className="alert good">{msg}</div>}<ErrorBox error={err} />
      <div className="card table-wrap">
        {!data?.length ? <Empty title="এখনো কোনো আবেদন নেই" /> : (
          <table className="table"><thead><tr><th>ক্রিয়েটর</th><th>যোগ্যতা ও প্রমাণ</th><th>সেট</th><th>পাওনা</th><th>অবস্থা</th><th /></tr></thead>
            <tbody>{data.map((c) => (
              <tr key={c.user_id}>
                <td><b>{c.display_name}</b>{c.verified ? ' ✔' : ''}<div className="tiny muted">{c.email || c.phone}</div></td>
                <td className="small">{c.credential}{c.evidence_url && <div><a href={c.evidence_url} target="_blank" rel="noreferrer">প্রমাণ দেখুন</a></div>}</td>
                <td>{bn(c.products)}</td>
                <td>৳{bn(Math.round(Number(c.balance)))}<div className="tiny muted">{c.payout_method} {c.payout_number}</div></td>
                <td><span className={`badge ${CREATOR_STATUS[c.status][1]}`}>{CREATOR_STATUS[c.status][0]}</span></td>
                <td className="row" style={{ gap: 4 }}>
                  {c.status !== 'approved' && <button className="btn sm" onClick={() => run(() => api.put(`/market/admin/creators/${c.user_id}`, { status: 'approved', verified: false }), `${c.display_name} অনুমোদিত`)}>অনুমোদন</button>}
                  {c.status === 'approved' && !c.verified && <button className="btn ghost sm" onClick={() => run(() => api.put(`/market/admin/creators/${c.user_id}`, { status: 'approved', verified: true }), `${c.display_name}-কে যাচাইকৃত ব্যাজ দেওয়া হয়েছে`)}>✔ যাচাইকৃত করুন</button>}
                  {c.status === 'pending' && <button className="btn light sm" onClick={() => run(() => api.put(`/market/admin/creators/${c.user_id}`, { status: 'rejected', admin_note: 'যোগ্যতার প্রমাণ যথেষ্ট নয়' }), 'প্রত্যাখ্যান করা হয়েছে')}>প্রত্যাখ্যান</button>}
                  {Number(c.balance) > 0 && <button className="btn light sm" onClick={() => setPay({ ...c, amount: Math.floor(Number(c.balance)), reference: '' })}>টাকা পরিশোধ</button>}
                </td>
              </tr>
            ))}</tbody></table>
        )}
      </div>
      <Modal open={!!pay} onClose={() => setPay(null)} title={`পরিশোধ — ${pay?.display_name || ''}`}>
        {pay && <div className="stack">
          <p className="small">{pay.payout_method} {pay.payout_number} নম্বরে টাকা পাঠিয়ে এখানে রেকর্ড করুন।</p>
          <input type="number" className="input" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
          <input className="input" placeholder="TrxID / রেফারেন্স" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
          <button className="btn" onClick={() => run(async () => { await api.post('/market/admin/payouts', { creator_id: pay.user_id, amount_bdt: pay.amount, method: pay.payout_method, reference: pay.reference }); setPay(null); }, 'পরিশোধ রেকর্ড হয়েছে')}>রেকর্ড করুন</button>
        </div>}
      </Modal>
    </div>
  );
}
