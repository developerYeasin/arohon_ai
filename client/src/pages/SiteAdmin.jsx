// Staff panel for public-website content: posts (blog / circulars / notices / resources), FAQ,
// mentors & success stories, contact/ask-a-mentor inbox and newsletter subscribers.
import { useState } from 'react';
import { api } from '../api.js';
import { useFetch, Loader, ErrorBox, Empty, Modal } from '../components/ui.jsx';
import { bn, fmtDate } from '../utils.js';

const POST_LABEL = { blog: 'ব্লগ ও গাইড', circular: 'চাকরির সার্কুলার', notice: 'নোটিশ ও রুটিন', resource: 'PDF ও রিসোর্স', video: 'ভিডিও' };
const MSG_LABEL = { contact: 'যোগাযোগ', question: 'মেন্টরকে প্রশ্ন', story: 'সফলতার গল্প', partnership: 'পার্টনারশিপ' };
const PEOPLE_LABEL = { advisor: 'উপদেষ্টা', mentor: 'মেন্টর', story: 'সফলতার গল্প' };
const TABS = [['posts', '📝 লেখা ও বিজ্ঞপ্তি'], ['faqs', '❔ প্রশ্নোত্তর'], ['people', '👩‍🏫 মেন্টর ও গল্প'], ['messages', '✉️ বার্তা'], ['subscribers', '📧 নিউজলেটার']];

// The API stores UTC; staff type and read times in Dhaka time (UTC+6, no DST).
const toLocal = (d) => (d ? new Date(new Date(d).getTime() + 6 * 36e5).toISOString().slice(0, 16) : '');
const toUtc = (v) => new Date(`${v}:00+06:00`).toISOString().slice(0, 19).replace('T', ' ');

// Generic edit form: `fields` = [key, label, type, options?]
function EditForm({ fields, initial, path, onDone }) {
  const [f, setF] = useState(initial);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, type) => (e) => setF({ ...f, [k]: type === 'check' ? (e.target.checked ? 1 : 0) : e.target.value });
  const save = async (e) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      const body = { ...f };
      for (const [k, , type] of fields) if (type === 'datetime' && body[k]) body[k] = toUtc(body[k]);
      delete body.id;
      if (initial.id) await api.put(`${path}/${initial.id}`, body); else await api.post(path, body);
      onDone();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={save}>
      <ErrorBox error={err} />
      {fields.map(([k, label, type, opts]) => (
        <div key={k} className="field">
          {type === 'check' ? <label className="row small"><input type="checkbox" checked={!!f[k]} onChange={set(k, type)} /> {label}</label> : <>
            <label htmlFor={`ef-${k}`}>{label}</label>
            {type === 'select' ? <select id={`ef-${k}`} className="input" value={f[k] ?? ''} onChange={set(k)}>{Object.entries(opts).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              : type === 'textarea' ? <textarea id={`ef-${k}`} className="input" rows={k === 'body' ? 12 : 4} value={f[k] ?? ''} onChange={set(k)} />
              : <input id={`ef-${k}`} className="input" type={type === 'datetime' ? 'datetime-local' : type || 'text'} value={f[k] ?? ''} onChange={set(k)} />}
          </>}
        </div>
      ))}
      <button className="btn" disabled={busy}>{busy ? 'সংরক্ষণ হচ্ছে…' : 'সংরক্ষণ করুন'}</button>
    </form>
  );
}

function Posts() {
  const [type, setType] = useState('circular');
  const { data, error, reload } = useFetch(`/site/admin/posts?type=${type}`, [type]);
  const [edit, setEdit] = useState(null);
  const open = async (id) => setEdit(id ? { ...(await api.get(`/site/admin/posts/${id}`)) } : { type, title: '', published: 1 });
  const del = async (id) => { if (confirm('মুছে ফেলবেন?')) { await api.del(`/site/admin/posts/${id}`); reload(); } };
  const fields = [
    ['type', 'ধরন', 'select', POST_LABEL], ['title', 'শিরোনাম'], ['slug', 'URL স্লাগ (খালি রাখলে শিরোনাম থেকে)'],
    ['category', 'ক্যাটাগরি (যেমন: বিসিএস, ব্যাংক, সরকারি)'], ['organization', 'প্রতিষ্ঠান (সার্কুলারের জন্য)'],
    ['deadline', 'আবেদনের শেষ তারিখ', 'date'], ['excerpt', 'সংক্ষিপ্ত বিবরণ', 'textarea'], ['body', 'মূল লেখা', 'textarea'],
    ['cover_url', 'কভার ছবির URL'], ['link_url', 'বাইরের লিংক (মূল বিজ্ঞপ্তি / PDF / YouTube)'],
    ['published_at', 'প্রকাশের সময় (ঢাকা)', 'datetime'], ['published', 'প্রকাশিত', 'check'],
  ];
  return (
    <div className="stack">
      <div className="row between">
        <div className="chips">{Object.entries(POST_LABEL).map(([k, l]) => <button key={k} className={`chip ${type === k ? 'active' : ''}`} onClick={() => setType(k)}>{l}</button>)}</div>
        <button className="btn" onClick={() => open(null)}>+ নতুন</button>
      </div>
      <ErrorBox error={error} />
      {!data ? <Loader /> : !data.length ? <div className="card"><Empty title="এখনো কিছু নেই" /></div> : (
        <div className="card table-wrap"><table className="table">
          <thead><tr><th>শিরোনাম</th><th>ক্যাটাগরি</th><th>প্রকাশ</th><th>দেখা</th><th /></tr></thead>
          <tbody>{data.map((p) => (
            <tr key={p.id}>
              <td><b>{p.title}</b>{p.deadline && <div className="tiny muted">শেষ তারিখ {fmtDate(p.deadline)}</div>}</td>
              <td>{p.category || '—'}</td>
              <td>{p.published ? fmtDate(p.published_at) : <span className="badge gray">খসড়া</span>}</td>
              <td>{bn(p.views)}</td>
              <td className="row"><button className="btn light sm" onClick={() => open(p.id)}>এডিট</button><button className="btn light sm" onClick={() => del(p.id)}>মুছুন</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'এডিট করুন' : 'নতুন যোগ করুন'} wide>
        {edit && <EditForm fields={fields} initial={{ ...edit, deadline: edit.deadline ? String(edit.deadline).slice(0, 10) : '', published_at: toLocal(edit.published_at) }} path="/site/admin/posts" onDone={() => { setEdit(null); reload(); }} />}
      </Modal>
    </div>
  );
}

function SimpleList({ path, fields, blank, columns, title }) {
  const { data, error, reload } = useFetch(path);
  const [edit, setEdit] = useState(null);
  const del = async (id) => { if (confirm('মুছে ফেলবেন?')) { await api.del(`${path}/${id}`); reload(); } };
  return (
    <div className="stack">
      <div className="row between"><h3 style={{ margin: 0 }}>{title}</h3><button className="btn" onClick={() => setEdit({ ...blank })}>+ নতুন</button></div>
      <ErrorBox error={error} />
      {!data ? <Loader /> : !data.length ? <div className="card"><Empty title="এখনো কিছু নেই" /></div> : (
        <div className="card table-wrap"><table className="table">
          <thead><tr>{columns.map(([, l]) => <th key={l}>{l}</th>)}<th /></tr></thead>
          <tbody>{data.map((r) => (
            <tr key={r.id}>{columns.map(([fn, l]) => <td key={l}>{fn(r)}</td>)}
              <td className="row"><button className="btn light sm" onClick={() => setEdit(r)}>এডিট</button><button className="btn light sm" onClick={() => del(r.id)}>মুছুন</button></td></tr>
          ))}</tbody>
        </table></div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'এডিট করুন' : 'নতুন যোগ করুন'} wide>
        {edit && <EditForm fields={fields} initial={edit} path={path} onDone={() => { setEdit(null); reload(); }} />}
      </Modal>
    </div>
  );
}

function Messages() {
  const [status, setStatus] = useState('new');
  const { data, error, reload } = useFetch(`/site/admin/messages?status=${status}`, [status]);
  const [reply, setReply] = useState({});
  const act = async (id, body) => { await api.put(`/site/admin/messages/${id}`, body); reload(); };
  return (
    <div className="stack">
      <div className="chips">{[['new', 'নতুন'], ['answered', 'উত্তর দেওয়া'], ['closed', 'বন্ধ']].map(([k, l]) => <button key={k} className={`chip ${status === k ? 'active' : ''}`} onClick={() => setStatus(k)}>{l}</button>)}</div>
      <ErrorBox error={error} />
      {!data ? <Loader /> : !data.length ? <div className="card"><Empty title="কোনো বার্তা নেই" /></div> : data.map((m) => (
        <div key={m.id} className="card">
          <div className="row between"><b>{m.subject || MSG_LABEL[m.kind]}</b><span className="row">{m.topic && <span className="badge gray">{m.topic}</span>}<span className={`badge ${m.kind === 'question' ? 'accent' : ''}`}>{MSG_LABEL[m.kind]}</span></span></div>
          <div className="tiny muted">{m.name} · {m.contact} · {fmtDate(m.created_at, true)}{m.user_id ? ` · ব্যবহারকারী #${m.user_id}` : ''}</div>
          <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{m.message}</p>
          {m.reply && <div className="explain small"><b>উত্তর:</b> {m.reply}</div>}
          {m.kind === 'question' && m.reply && <label className="row small mt"><input type="checkbox" checked={!!m.is_public} onChange={(e) => act(m.id, { is_public: e.target.checked ? 1 : 0 })} /> "মেন্টরকে প্রশ্ন" পাতায় সবার জন্য দেখাও (নাম ও যোগাযোগ দেখানো হবে না)</label>}
          {m.status !== 'closed' && <>
            <textarea className="input mt" rows={3} placeholder={m.user_id ? 'উত্তর লিখুন — শিক্ষার্থী "মেন্টরকে প্রশ্ন" পাতায় দেখবেন' : 'উত্তর/নোট (যোগাযোগের তথ্যে আলাদাভাবে জানান)'} value={reply[m.id] ?? ''} onChange={(e) => setReply({ ...reply, [m.id]: e.target.value })} />
            <div className="row mt"><button className="btn sm" disabled={!reply[m.id]} onClick={() => act(m.id, { reply: reply[m.id], status: 'answered' })}>উত্তর সংরক্ষণ</button>
              <button className="btn light sm" onClick={() => act(m.id, { status: 'closed' })}>বন্ধ করুন</button></div>
          </>}
        </div>
      ))}
    </div>
  );
}

function Subscribers() {
  const { data, error } = useFetch('/site/admin/subscribers');
  return (
    <div className="card">
      <ErrorBox error={error} />
      {!data ? <Loader /> : <>
        <div className="row between"><b>মোট {bn(data.length)} জন</b>
          {data.length > 0 && <button className="btn light sm" onClick={() => navigator.clipboard?.writeText(data.map((s) => s.email).join('\n'))}>সব ইমেইল কপি</button>}</div>
        {data.map((s) => <div key={s.id} className="row between small" style={{ padding: '.3rem 0', borderBottom: '1px dashed var(--line)' }}><span>{s.email}</span><span className="muted">{fmtDate(s.created_at)}</span></div>)}
      </>}
    </div>
  );
}

export default function SiteAdmin() {
  const [tab, setTab] = useState('posts');
  return (
    <div className="stack">
      <div className="chips">{TABS.map(([k, l]) => <button key={k} className={`chip ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'posts' && <Posts />}
      {tab === 'faqs' && <SimpleList path="/site/admin/faqs" title="প্রশ্নোত্তর" blank={{ category: 'সাধারণ', question: '', answer: '', sort_order: 0, published: 1 }}
        fields={[['category', 'ক্যাটাগরি (যেমন: প্যাকেজ, পেমেন্ট, পরীক্ষা)'], ['question', 'প্রশ্ন'], ['answer', 'উত্তর', 'textarea'], ['sort_order', 'ক্রম', 'number'], ['published', 'প্রকাশিত', 'check']]}
        columns={[[(r) => r.category, 'ক্যাটাগরি'], [(r) => r.question, 'প্রশ্ন'], [(r) => (r.published ? '✓' : 'খসড়া'), 'প্রকাশ']]} />}
      {tab === 'people' && <SimpleList path="/site/admin/people" title="মেন্টর, উপদেষ্টা ও সফলতার গল্প" blank={{ kind: 'mentor', name: '', sort_order: 0, published: 1 }}
        fields={[['kind', 'ধরন', 'select', PEOPLE_LABEL], ['name', 'নাম'], ['role_line', 'পরিচয় (যেমন: ৪০তম বিসিএস, প্রশাসন ক্যাডার)'], ['exam_tag', 'ট্যাগ (যেমন: বিসিএস)'],
          ['bio', 'পরিচিতি / গল্প (শিক্ষার্থীর অনুমতি নিয়ে তাঁর নিজের কথা)', 'textarea'], ['photo_url', 'ছবির URL'], ['sort_order', 'ক্রম', 'number'], ['published', 'প্রকাশিত', 'check']]}
        columns={[[(r) => PEOPLE_LABEL[r.kind], 'ধরন'], [(r) => r.name, 'নাম'], [(r) => r.role_line || '—', 'পরিচয়'], [(r) => (r.published ? '✓' : 'খসড়া'), 'প্রকাশ']]} />}
      {tab === 'messages' && <Messages />}
      {tab === 'subscribers' && <Subscribers />}
    </div>
  );
}
