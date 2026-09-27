import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { Modal, useFetch, Loader, ErrorBox } from './ui.jsx';
import { useAuth } from '../auth.jsx';
import { bn, fmtDate } from '../utils.js';

export const REPORT_REASONS = {
  wrong_answer: 'উত্তর ভুল', outdated: 'তথ্য পুরোনো', ambiguous: 'প্রশ্ন অস্পষ্ট', typo: 'বানান/টাইপো',
  bad_explanation: 'ব্যাখ্যা ঠিক নেই', duplicate: 'একই প্রশ্ন দুবার', other: 'অন্যান্য',
};

export function ReportButton({ questionId }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('wrong_answer');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const send = async () => {
    setErr(null);
    try { await api.post(`/questions/${questionId}/report`, { reason, note }); setMsg('ধন্যবাদ! বিশেষজ্ঞ যাচাই করে সংশোধন করবেন। অবস্থা প্রোফাইলে দেখতে পাবেন।'); }
    catch (e) { setErr(e.message); }
  };
  return (
    <>
      <button className="btn light sm" onClick={() => { setOpen(true); setMsg(null); }}>⚠ রিপোর্ট</button>
      <Modal open={open} onClose={() => setOpen(false)} title="প্রশ্নে সমস্যা রিপোর্ট করুন">
        {msg ? <div className="alert good">{msg}</div> : <>
          <ErrorBox error={err} />
          <div className="chips mb">{Object.entries(REPORT_REASONS).map(([k, v]) => <button key={k} className={`chip ${reason === k ? 'active' : ''}`} onClick={() => setReason(k)}>{v}</button>)}</div>
          <div className="field"><label htmlFor="rn">বিস্তারিত (সূত্র দিলে দ্রুত যাচাই হয়)</label><textarea id="rn" className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <button className="btn block" onClick={send}>রিপোর্ট পাঠান</button>
        </>}
      </Modal>
    </>
  );
}

export function BookmarkButton({ questionId, initial }) {
  const [on, setOn] = useState(!!initial);
  const toggle = async () => { const d = await api.post(`/questions/${questionId}/bookmark`); setOn(d.bookmarked); };
  return <button className="btn light sm" onClick={toggle} aria-pressed={on}>{on ? '🔖 সংরক্ষিত' : '🔖 সংরক্ষণ'}</button>;
}

export function DiscussionButton({ questionId }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn light sm" onClick={() => setOpen(true)}>💬 আলোচনা</button>
      {open && <DiscussionModal questionId={questionId} onClose={() => setOpen(false)} />}
    </>
  );
}

function DiscussionModal({ questionId, onClose }) {
  const { user } = useAuth();
  const area = useLocation().pathname.startsWith('/admin') ? '/admin' : '/app';
  const { data, loading, error, reload } = useFetch(`/questions/${questionId}`);
  const [body, setBody] = useState('');
  const [err, setErr] = useState(null);
  const post = async () => {
    setErr(null);
    try { await api.post(`/questions/${questionId}/discussions`, { body }); setBody(''); reload(); } catch (e) { setErr(e.message); }
  };
  const vote = async (d, v) => { await api.post(`/discussions/${d.id}/vote`, { value: d.my_vote === v ? 0 : v }); reload(); };
  const verify = async (d) => { await api.post(`/discussions/${d.id}/verify`); reload(); };
  const staff = ['admin', 'teacher'].includes(user.role);
  return (
    <Modal open onClose={onClose} title="প্রশ্ন নিয়ে আলোচনা" wide>
      {loading && !data ? <Loader /> : error ? <ErrorBox error={error} /> : <>
        <div className="qbody mb">{data.body}</div>
        <div className="row small muted mb">
          {data.stats.attempts > 0 && <span>{bn(data.stats.attempts)} জন চেষ্টা করেছেন · সঠিক {bn(data.stats.accuracy)}% · গড় {bn(data.stats.avg_sec)} সেকেন্ড</span>}
          <span>· সংস্করণ {bn(data.version)}{data.last_verified_at ? ` · যাচাই: ${fmtDate(data.last_verified_at)}` : ''}</span>
          <Link to={`${area}/question/${questionId}`} onClick={onClose}>পূর্ণ পাতা →</Link>
        </div>
        {data.discussions.length === 0 && <p className="muted small">এখনো কোনো আলোচনা নেই। প্রথম ব্যাখ্যাটি আপনিই লিখুন!</p>}
        {data.discussions.map((d) => (
          <div key={d.id} className="insight" style={d.is_verified ? { background: 'var(--good-soft)' } : null}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 36 }}>
              <button className="linkbtn" aria-label="সহমত" onClick={() => vote(d, 1)} style={{ opacity: d.my_vote === 1 ? 1 : .5 }}>▲</button>
              <b>{bn(d.score)}</b>
              <button className="linkbtn" aria-label="অসহমত" onClick={() => vote(d, -1)} style={{ opacity: d.my_vote === -1 ? 1 : .5 }}>▼</button>
            </div>
            <div style={{ flex: 1 }}>
              <div className="small"><b>{d.name}</b> {d.role !== 'student' && <span className="badge">{d.role === 'admin' ? 'বিশেষজ্ঞ' : 'শিক্ষক'}</span>} {d.is_verified ? <span className="badge good">✓ যাচাইকৃত উত্তর</span> : null}</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{d.body}</div>
              {staff && <button className="linkbtn tiny" onClick={() => verify(d)}>{d.is_verified ? 'যাচাই বাতিল' : 'যাচাইকৃত হিসেবে চিহ্নিত করুন'}</button>}
            </div>
          </div>
        ))}
        <ErrorBox error={err} />
        <div className="field mt"><label htmlFor="db">আপনার ব্যাখ্যা বা প্রশ্ন ("কেন খ সঠিক?")</label><textarea id="db" className="input" value={body} onChange={(e) => setBody(e.target.value)} /></div>
        <button className="btn" onClick={post} disabled={body.trim().length < 3}>পোস্ট করুন</button>
      </>}
    </Modal>
  );
}
