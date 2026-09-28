import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, bn, examUrl, fmtDate, fmtTime, LETTERS, num, OPTION_IDS, parseBulk, readImage, toCsv, TYPES } from './lib.js';
import { CopyLink, download, Modal, QR, QuestionView } from './ui.jsx';
import { STATUS } from './Dashboard.jsx';

const TABS = [['questions', '📝 প্রশ্ন'], ['settings', '⚙️ সেটিং'], ['share', '🔗 শেয়ার'], ['results', '📊 ফলাফল']];

export default function Editor() {
  const { id, tab = 'questions' } = useParams();
  const nav = useNavigate();
  const [form, setForm] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const reload = () => api(`/forms/${id}`).then(setForm).catch((e) => setErr(e.message));
  useEffect(() => { reload(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(null), 2500); return () => clearTimeout(t); } return undefined; }, [msg]);

  const save = async (patch, note) => {
    setErr(null);
    try { const f = await api(`/forms/${id}`, { method: 'PUT', body: patch }); setForm((o) => ({ ...o, ...f })); if (note) setMsg(note); return true; } catch (e) { setErr(e.message); return false; }
  };
  const publish = async () => { if (await save({ status: 'live' }, 'পরীক্ষা চালু হয়েছে — লিংক শেয়ার করুন')) nav(`/f/${id}/share`); };

  if (!form) return err ? <div className="alert bad">{err}</div> : <div className="loader" />;
  return (
    <div className="stack">
      <Link to="/" className="small">← সব পরীক্ষা</Link>
      <div className="row">
        <TitleEdit value={form.title} onSave={(title) => save({ title })} />
        <span className={`badge ${STATUS[form.status][1]}`}>{STATUS[form.status][0]}</span>
        <span className="spacer" />
        {form.status !== 'live'
          ? <button className="btn accent" onClick={publish}>🚀 প্রকাশ করুন ও লিংক নিন</button>
          : <button className="btn light" onClick={() => save({ status: 'closed' }, 'পরীক্ষা বন্ধ — লিংকে আর পরীক্ষা দেওয়া যাবে না')}>⏹ পরীক্ষা বন্ধ করুন</button>}
      </div>
      {form.status === 'live' && <CopyLink code={form.code} />}
      {err && <div className="alert bad">{err}</div>}
      {msg && <div className="alert good">{msg}</div>}
      <div className="tabs">{TABS.map(([k, l]) => <Link key={k} to={`/f/${id}${k === 'questions' ? '' : `/${k}`}`} className={`tab ${tab === k ? 'on' : ''}`}>{l}{k === 'questions' ? ` (${bn(form.questions.length)})` : k === 'results' ? ` (${bn(form.submissions)})` : ''}</Link>)}</div>
      {tab === 'questions' && <Questions form={form} setForm={setForm} setErr={setErr} setMsg={setMsg} />}
      {tab === 'settings' && <Settings form={form} save={save} onDelete={async () => { await api(`/forms/${id}`, { method: 'DELETE' }); nav('/'); }}
        onDuplicate={async () => { const r = await api(`/forms/${id}/duplicate`, { method: 'POST' }); nav(`/f/${r.id}`); }} />}
      {tab === 'share' && <Share form={form} publish={publish} />}
      {tab === 'results' && <Results form={form} />}
    </div>
  );
}

function TitleEdit({ value, onSave }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <input className="title-input" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v.trim() && v !== value && onSave(v.trim())}
    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} aria-label="পরীক্ষার নাম" />;
}

// ---------------- questions ----------------
const blank = (type = 'single') => ({ type, body: '', image: null, options: type === 'text' ? null : [0, 1, 2, 3].map((i) => ({ id: OPTION_IDS[i], text: '', image: null })), answer: [], marks: '', explanation: '' });

function Questions({ form, setForm, setErr, setMsg }) {
  const [editing, setEditing] = useState(null); // question id or 'new'
  const [bulk, setBulk] = useState(false);
  const qs = form.questions;
  const setQs = (questions) => setForm((f) => ({ ...f, questions }));

  const saveQ = async (q) => {
    const body = { ...q, marks: q.marks === '' ? null : q.marks };
    const saved = q.id
      ? await api(`/forms/${form.id}/questions/${q.id}`, { method: 'PUT', body })
      : await api(`/forms/${form.id}/questions`, { method: 'POST', body });
    setQs(q.id ? qs.map((x) => (x.id === q.id ? saved : x)) : [...qs, saved]);
    setEditing(null); setMsg('প্রশ্ন সেভ হয়েছে');
  };
  const remove = async (q) => {
    if (!window.confirm('প্রশ্নটি মুছে ফেলবেন?')) return;
    try { await api(`/forms/${form.id}/questions/${q.id}`, { method: 'DELETE' }); setQs(qs.filter((x) => x.id !== q.id)); } catch (e) { setErr(e.message); }
  };
  const copy = async (q) => {
    try { const { id, position, form_id, ...rest } = q; const saved = await api(`/forms/${form.id}/questions`, { method: 'POST', body: rest }); setQs([...qs, saved]); } catch (e) { setErr(e.message); }
  };
  const move = async (i, d) => {
    const next = [...qs]; [next[i], next[i + d]] = [next[i + d], next[i]]; setQs(next);
    try { await api(`/forms/${form.id}/reorder`, { method: 'POST', body: { ids: next.map((q) => q.id) } }); } catch (e) { setErr(e.message); }
  };
  const total = qs.reduce((a, q) => a + Number(q.marks ?? form.marks_per_q), 0);

  return (
    <div className="stack">
      <div className="row small muted">
        <span>মোট {bn(qs.length)} প্রশ্ন · পূর্ণমান {num(total)}</span><span>·</span>
        <span>প্রতি প্রশ্নে {num(form.marks_per_q)} নম্বর, ভুলে −{num(form.negative_mark)}</span>
        <Link to={`/f/${form.id}/settings`}>পরিবর্তন</Link>
      </div>
      {qs.map((q, i) => (editing === q.id
        ? <QuestionForm key={q.id} initial={q} n={i + 1} defaultMarks={form.marks_per_q} onSave={saveQ} onCancel={() => setEditing(null)} />
        : (
          <div key={q.id} className="card qcard">
            <div className="row tiny muted"><span className="pill">{TYPES[q.type]}</span><span>{num(q.marks ?? form.marks_per_q)} নম্বর</span><span className="spacer" />
              <button className="icon" disabled={!i} onClick={() => move(i, -1)} title="উপরে">↑</button>
              <button className="icon" disabled={i === qs.length - 1} onClick={() => move(i, 1)} title="নিচে">↓</button>
              <button className="icon" onClick={() => copy(q)} title="কপি">⧉</button>
              <button className="icon" onClick={() => setEditing(q.id)} title="সম্পাদনা">✏️</button>
              <button className="icon danger" onClick={() => remove(q)} title="মুছুন">🗑</button>
            </div>
            <div onClick={() => setEditing(q.id)} className="clickable"><QuestionView q={q} n={bn(i + 1)} showAnswer /></div>
            {q.explanation && <div className="expl">💡 {q.explanation}</div>}
          </div>
        )))}
      {editing === 'new'
        ? <QuestionForm initial={blank()} n={qs.length + 1} defaultMarks={form.marks_per_q} onSave={saveQ} onCancel={() => setEditing(null)} />
        : (
          <div className="add-row">
            <button className="btn" onClick={() => setEditing('new')}>+ প্রশ্ন যোগ করুন</button>
            <button className="btn light" onClick={() => setBulk(true)}>📋 একসাথে অনেক প্রশ্ন (পেস্ট)</button>
          </div>
        )}
      <BulkImport open={bulk} onClose={() => setBulk(false)} onDone={(added) => { setQs([...qs, ...added]); setBulk(false); setMsg(`${bn(added.length)}টি প্রশ্ন যোগ হয়েছে`); }} formId={form.id} />
    </div>
  );
}

function ImagePick({ value, onChange, label = '🖼️ ছবি' }) {
  const [err, setErr] = useState(null);
  return (
    <span className="imgpick">
      {value ? (
        <span className="thumb"><img src={value} alt="" /><button type="button" className="x" onClick={() => onChange(null)} aria-label="ছবি সরান">✕</button></span>
      ) : (
        <label className="btn small light">{label}<input type="file" accept="image/*" hidden onChange={async (e) => {
          const f = e.target.files[0]; e.target.value = ''; if (!f) return;
          try { setErr(null); onChange(await readImage(f)); } catch (x) { setErr(x.message); }
        }} /></label>
      )}
      {err && <span className="tiny tone-bad">{err}</span>}
    </span>
  );
}

function QuestionForm({ initial, n, defaultMarks, onSave, onCancel }) {
  const [q, setQ] = useState(() => ({ ...initial, marks: initial.marks ?? '', explanation: initial.explanation || '', textAnswer: initial.type === 'text' ? initial.answer.join(' | ') : '' }));
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (p) => setQ((o) => ({ ...o, ...p }));

  const changeType = (type) => {
    if (type === q.type) return;
    if (type === 'text') set({ type, options: null, answer: [] });
    else set({ type, options: q.options || blank().options, answer: type === 'single' ? q.answer.slice(0, 1) : q.answer });
  };
  const setOpt = (i, p) => set({ options: q.options.map((o, j) => (j === i ? { ...o, ...p } : o)) });
  const toggle = (id) => set({ answer: q.type === 'single' ? [id] : q.answer.includes(id) ? q.answer.filter((a) => a !== id) : [...q.answer, id] });
  const addOpt = () => q.options.length < 8 && set({ options: [...q.options, { id: OPTION_IDS.split('').find((c) => !q.options.some((o) => o.id === c)), text: '', image: null }] });
  const delOpt = (i) => { const o = q.options[i]; set({ options: q.options.filter((_, j) => j !== i), answer: q.answer.filter((a) => a !== o.id) }); };

  const submit = async (e) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      const { textAnswer, ...rest } = q;
      await onSave({ ...rest, answer: q.type === 'text' ? textAnswer.split('|').map((s) => s.trim()).filter(Boolean) : q.answer });
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };

  return (
    <form className="card qform stack" onSubmit={submit}>
      <div className="row">
        <b>প্রশ্ন {bn(n)}</b><span className="spacer" />
        <select className="input auto" value={q.type} onChange={(e) => changeType(e.target.value)} aria-label="প্রশ্নের ধরন">
          {Object.entries(TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <textarea className="input" rows={2} placeholder="প্রশ্ন লিখুন" value={q.body} onChange={(e) => set({ body: e.target.value })} autoFocus />
      <ImagePick value={q.image} onChange={(image) => set({ image })} label="🖼️ প্রশ্নে ছবি" />

      {q.type === 'text' ? (
        <label className="field"><span>সঠিক উত্তর <span className="muted tiny">(একাধিক গ্রহণযোগ্য উত্তর | দিয়ে আলাদা করুন — যেমন: ঢাকা | Dhaka। ছোট-বড় হাতের অক্ষর ও বাংলা/ইংরেজি সংখ্যা মিলিয়ে দেখা হয়)</span></span>
          <input className="input" value={q.textAnswer} onChange={(e) => set({ textAnswer: e.target.value })} placeholder="ঢাকা | Dhaka" /></label>
      ) : (
        <div className="stack tight">
          <div className="tiny muted">{q.type === 'single' ? 'সঠিক উত্তরের বৃত্তে ক্লিক করুন' : 'সবগুলো সঠিক উত্তরে টিক দিন — সব মিললে তবেই নম্বর'}</div>
          {q.options.map((o, i) => (
            <div key={o.id} className={`optedit ${q.answer.includes(o.id) ? 'right' : ''}`}>
              <button type="button" className={`pick ${q.type}`} onClick={() => toggle(o.id)} aria-label={`${LETTERS[i]} সঠিক`}>{q.answer.includes(o.id) ? '✓' : LETTERS[i]}</button>
              <input className="input grow" placeholder={`অপশন ${LETTERS[i]}`} value={o.text} onChange={(e) => setOpt(i, { text: e.target.value })} />
              <ImagePick value={o.image} onChange={(image) => setOpt(i, { image })} label="🖼️" />
              {q.options.length > 2 && <button type="button" className="icon danger" onClick={() => delOpt(i)} aria-label="অপশন মুছুন">✕</button>}
            </div>
          ))}
          {q.options.length < 8 && <button type="button" className="linkbtn" onClick={addOpt}>+ অপশন যোগ</button>}
        </div>
      )}

      <div className="grid2">
        <label className="field"><span>ব্যাখ্যা <span className="muted tiny">(ফলাফলে দেখাবে)</span></span>
          <textarea className="input" rows={2} value={q.explanation} onChange={(e) => set({ explanation: e.target.value })} /></label>
        <label className="field"><span>নম্বর <span className="muted tiny">(খালি = ডিফল্ট {num(defaultMarks)})</span></span>
          <input className="input" type="number" min="0" step="0.25" value={q.marks} onChange={(e) => set({ marks: e.target.value })} /></label>
      </div>
      {err && <div className="alert bad">{err}</div>}
      <div className="row"><button className="btn" disabled={busy}>{busy ? 'সেভ হচ্ছে…' : '✓ সেভ করুন'}</button><button type="button" className="btn light" onClick={onCancel}>বাতিল</button></div>
    </form>
  );
}

const SAMPLE = `১. বাংলাদেশের জাতীয় ফুল কোনটি?
ক) গোলাপ
*খ) শাপলা
গ) জবা
ঘ) পদ্ম
ব্যাখ্যা: শাপলা বাংলাদেশের জাতীয় ফুল।

২. কোনগুলো মৌলিক সংখ্যা?
*ক) 2
খ) 4
*গ) 5
ঘ) 9

৩. বাংলাদেশের রাজধানীর নাম লিখুন।
উত্তর: ঢাকা | Dhaka`;

function BulkImport({ open, onClose, onDone, formId }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const parsed = text.trim() ? parseBulk(text) : [];
  const bad = parsed.filter((q) => q.error);
  const add = async () => {
    setErr(null); setBusy(true);
    try { onDone(await api(`/forms/${formId}/questions`, { method: 'POST', body: { questions: parsed.map(({ error, n, ...q }) => q) } })); setText(''); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="একসাথে অনেক প্রশ্ন যোগ" wide>
      <div className="stack">
        <p className="small muted">প্রতিটি প্রশ্নের মাঝে একটি ফাঁকা লাইন দিন। সঠিক অপশনের আগে <b>*</b> দিন (একাধিক * = একাধিক সঠিক উত্তর)। অপশন না থাকলে <b>উত্তর:</b> লাইন দিন — লিখে উত্তরের প্রশ্ন হবে। <b>ব্যাখ্যা:</b> ঐচ্ছিক।
          <button type="button" className="linkbtn" onClick={() => setText(SAMPLE)}>নমুনা দেখুন</button></p>
        <textarea className="input mono" rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder={SAMPLE} />
        {!!parsed.length && (
          <div className="small">
            <b>{bn(parsed.length)}টি প্রশ্ন পাওয়া গেছে</b>{bad.length ? <span className="tone-bad"> · {bn(bad.length)}টিতে সমস্যা: {bad.map((q) => `#${bn(q.n)} ${q.error}`).join(', ')}</span> : ' ✓'}
            <div className="tiny muted">{parsed.map((q) => `${bn(q.n)}. ${TYPES[q.type]}`).join(' · ')}</div>
          </div>
        )}
        {err && <div className="alert bad">{err}</div>}
        <button className="btn" disabled={!parsed.length || bad.length || busy} onClick={add}>{busy ? 'যোগ হচ্ছে…' : `${bn(parsed.length)}টি প্রশ্ন যোগ করুন`}</button>
      </div>
    </Modal>
  );
}

// ---------------- settings ----------------
const toLocal = (v) => { if (!v) return ''; const d = new Date(v); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

function Settings({ form, save, onDelete, onDuplicate }) {
  const [s, setS] = useState(() => ({
    description: form.description || '', duration_min: form.duration_min, marks_per_q: Number(form.marks_per_q), negative_mark: Number(form.negative_mark),
    pass_mark: form.pass_mark ?? '', shuffle_questions: !!form.shuffle_questions, shuffle_options: !!form.shuffle_options, one_attempt: !!form.one_attempt,
    show_result: form.show_result, show_answers: !!form.show_answers, show_leaderboard: !!form.show_leaderboard, leaderboard_limit: form.leaderboard_limit ?? 50, password: form.password || '',
    starts_at: toLocal(form.starts_at), ends_at: toLocal(form.ends_at),
  }));
  const [saved, setSaved] = useState(false);
  const set = (p) => { setSaved(false); setS((o) => ({ ...o, ...p })); };
  const submit = async (e) => {
    e.preventDefault();
    setSaved(await save({ ...s, starts_at: s.starts_at ? new Date(s.starts_at).toISOString() : null, ends_at: s.ends_at ? new Date(s.ends_at).toISOString() : null }, 'সেটিং সেভ হয়েছে'));
  };
  const Check = ({ k, children }) => <label className="check"><input type="checkbox" checked={s[k]} onChange={(e) => set({ [k]: e.target.checked })} /> {children}</label>;

  return (
    <form className="stack" onSubmit={submit}>
      <div className="card stack">
        <h3>সাধারণ</h3>
        <label className="field"><span>নির্দেশনা <span className="muted tiny">(পরীক্ষা শুরুর আগে দেখাবে)</span></span>
          <textarea className="input" rows={3} value={s.description} onChange={(e) => set({ description: e.target.value })} placeholder="যেমন: মোবাইল হাতে রাখুন, প্রতিটি প্রশ্ন মনোযোগ দিয়ে পড়ুন…" /></label>
        <div className="grid3">
          <label className="field"><span>⏱ সময় (মিনিট)</span><input className="input" type="number" min="0" max="600" value={s.duration_min} onChange={(e) => set({ duration_min: e.target.value })} /><span className="tiny muted">০ = সময়সীমা নেই</span></label>
          <label className="field"><span>প্রতি প্রশ্নে নম্বর</span><input className="input" type="number" min="0" step="0.25" value={s.marks_per_q} onChange={(e) => set({ marks_per_q: e.target.value })} /></label>
          <label className="field"><span>➖ নেগেটিভ মার্ক (প্রতি ভুলে)</span><input className="input" type="number" min="0" step="0.05" value={s.negative_mark} onChange={(e) => set({ negative_mark: e.target.value })} /><span className="tiny muted">যেমন ০.২৫ বা ০.৫০; উত্তর না দিলে কাটা যাবে না</span></label>
          <label className="field"><span>পাস মার্ক</span><input className="input" type="number" min="0" step="0.5" value={s.pass_mark} onChange={(e) => set({ pass_mark: e.target.value })} placeholder="ঐচ্ছিক" /></label>
        </div>
      </div>

      <div className="card stack">
        <h3>সময়সূচি ও প্রবেশ</h3>
        <div className="grid3">
          <label className="field"><span>শুরু</span><input className="input" type="datetime-local" value={s.starts_at} onChange={(e) => set({ starts_at: e.target.value })} /><span className="tiny muted">খালি = এখনই</span></label>
          <label className="field"><span>শেষ</span><input className="input" type="datetime-local" value={s.ends_at} onChange={(e) => set({ ends_at: e.target.value })} /><span className="tiny muted">এরপর লিংকে পরীক্ষা দেওয়া যাবে না</span></label>
          <label className="field"><span>🔒 পাসওয়ার্ড</span><input className="input" value={s.password} onChange={(e) => set({ password: e.target.value })} placeholder="ঐচ্ছিক" /></label>
        </div>
        <Check k="one_attempt">একজন একবারই পরীক্ষা দিতে পারবে (একই নাম বা একই ডিভাইস)</Check>
        <Check k="shuffle_questions">প্রত্যেকের জন্য প্রশ্নের ক্রম এলোমেলো</Check>
        <Check k="shuffle_options">অপশনের ক্রম এলোমেলো</Check>
      </div>

      <div className="card stack">
        <h3>ফলাফল</h3>
        <label className="field"><span>পরীক্ষার্থী ফলাফল কখন দেখবে</span>
          <select className="input" value={s.show_result} onChange={(e) => set({ show_result: e.target.value })}>
            <option value="immediate">জমা দেওয়ার সাথে সাথে</option>
            <option value="after_end">পরীক্ষার শেষ সময়ের পরে</option>
            <option value="never">দেখাবে না (শুধু শিক্ষক দেখবেন)</option>
          </select></label>
        <Check k="show_answers">সঠিক উত্তর ও ব্যাখ্যা দেখাবে</Check>
        <Check k="show_leaderboard">মেধাতালিকা প্রকাশ করবে (পরীক্ষার্থীরা দেখতে পাবে)</Check>
        {s.show_leaderboard && <label className="field"><span>🏆 মেধাতালিকায় কতজন দেখাবে</span>
          <input className="input" type="number" min="0" max="1000" value={s.leaderboard_limit} onChange={(e) => set({ leaderboard_limit: e.target.value })} />
          <span className="tiny muted">যেমন ১০ = শীর্ষ ১০ জন; ০ = সবাই</span></label>}
      </div>

      <div className="row"><button className="btn">✓ সেটিং সেভ করুন</button>{saved && <span className="tone-good small">✅ সেভ হয়েছে</span>}<span className="spacer" />
        <button type="button" className="btn light" onClick={onDuplicate}>⧉ কপি বানান</button>
        <button type="button" className="btn light danger" onClick={() => window.confirm('পরীক্ষা, সব প্রশ্ন ও সব ফলাফল মুছে যাবে। নিশ্চিত?') && onDelete()}>🗑 মুছুন</button></div>
    </form>
  );
}

// ---------------- share ----------------
function Share({ form, publish }) {
  const url = examUrl(form.code);
  const text = encodeURIComponent(`${form.title} — এই লিংকে পরীক্ষা দিন: ${url}`);
  if (form.status === 'draft') {
    return (
      <div className="card center empty"><div className="big-ico">🔒</div><h3>পরীক্ষা এখনো খসড়া</h3>
        <p className="muted">প্রকাশ করলেই লিংক চালু হবে।</p><button className="btn accent" onClick={publish}>🚀 প্রকাশ করুন</button></div>
    );
  }
  return (
    <div className="card stack center">
      {form.status === 'closed' && <div className="alert bad">পরীক্ষা বন্ধ — লিংকে ঢুকলে "পরীক্ষা শেষ" দেখাবে। আবার চালু করতে উপরে "প্রকাশ করুন" চাপুন।</div>}
      <h3>পরীক্ষার লিংক</h3>
      <CopyLink code={form.code} />
      <QR text={url} size={220} />
      <p className="tiny muted">পরীক্ষার হলে বোর্ডে/প্রজেক্টরে QR দেখান — মোবাইলে স্ক্যান করে সরাসরি পরীক্ষা।</p>
      <div className="row center-row">
        <a className="btn wa" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${text}`}>WhatsApp</a>
        <a className="btn fb" target="_blank" rel="noreferrer" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}>Facebook</a>
        <a className="btn light" target="_blank" rel="noreferrer" href={url}>👁 পরীক্ষার্থীর চোখে দেখুন</a>
      </div>
    </div>
  );
}

// ---------------- results ----------------
function Results({ form }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(null);
  const [view, setView] = useState('list');
  const load = () => api(`/forms/${form.id}/results`).then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [form.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <div className="alert bad">{err}</div>;
  if (!data) return <div className="loader" />;
  const { summary: s, submissions, stats } = data;
  const done = submissions.filter((x) => x.status === 'submitted');
  const exportCsv = () => download(`${form.title}-ফলাফল.csv`, toCsv([
    ['মেধাক্রম', 'নাম', 'মোবাইল', 'ইমেইল', 'জেলা', 'প্রাপ্ত নম্বর', 'পূর্ণমান', 'সঠিক', 'ভুল', 'উত্তর দেয়নি', 'সময় (সেকেন্ড)', 'জমার সময়', ...(form.pass_mark != null ? ['ফলাফল'] : [])],
    ...done.map((x, i) => [i + 1, x.name, x.phone || '', x.email || '', x.district || '', x.score, x.total_marks, x.correct, x.wrong, x.skipped, x.time_sec, new Date(x.submitted_at).toLocaleString('en-GB'),
      ...(form.pass_mark != null ? [x.score >= Number(form.pass_mark) ? 'পাস' : 'ফেল'] : [])]),
  ]));
  const remove = async (x) => {
    if (!window.confirm(`${x.name}-এর উত্তর মুছে ফেলবেন? তিনি আবার পরীক্ষা দিতে পারবেন।`)) return;
    await api(`/forms/${form.id}/submissions/${x.id}`, { method: 'DELETE' }); load();
  };

  return (
    <div className="stack">
      <div className="stats">
        <div className="stat"><b>{bn(s.submitted)}</b><span>জমা দিয়েছে</span></div>
        <div className="stat"><b>{bn(s.in_progress)}</b><span>এখন দিচ্ছে</span></div>
        <div className="stat"><b>{num(s.avg)}</b><span>গড় নম্বর</span></div>
        <div className="stat"><b>{num(s.highest)}</b><span>সর্বোচ্চ</span></div>
        {s.passed != null && <div className="stat"><b>{bn(s.passed)}/{bn(s.submitted)}</b><span>পাস</span></div>}
      </div>
      <div className="row">
        <div className="seg">{[['list', 'পরীক্ষার্থী'], ['questions', 'প্রশ্নভিত্তিক বিশ্লেষণ']].map(([k, l]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}</div>
        <span className="spacer" /><button className="btn small light" onClick={load}>↻ রিফ্রেশ</button>
        <button className="btn small" disabled={!done.length} onClick={exportCsv}>⬇ Excel (CSV)</button>
      </div>

      {view === 'list' ? (
        !submissions.length ? <div className="card center empty"><div className="big-ico">⏳</div><h3>এখনো কেউ পরীক্ষা দেয়নি</h3><p className="muted small">লিংক শেয়ার করুন — কেউ জমা দিলেই এখানে দেখাবে (১৫ সেকেন্ড পরপর আপডেট হয়)।</p></div> : (
          <div className="card table-wrap">
            <table className="table">
              <thead><tr><th>#</th><th>নাম</th><th>যোগাযোগ</th><th>নম্বর</th><th>সঠিক / ভুল / বাদ</th><th>সময়</th><th>জমা</th><th /></tr></thead>
              <tbody>{submissions.map((x, i) => (
                <tr key={x.id}>
                  <td>{x.status === 'submitted' ? bn(i + 1) : '—'}</td>
                  <td><b>{x.name}</b>{x.district && <div className="tiny muted">{x.district}</div>}</td>
                  <td className="tiny">{x.phone}{x.email && <div className="muted">{x.email}</div>}</td>
                  <td>{x.status === 'submitted' ? <><b>{num(x.score)}</b><span className="muted">/{num(x.total_marks)}</span>
                    {form.pass_mark != null && <span className={`badge ${x.score >= Number(form.pass_mark) ? 'good' : 'bad'}`}>{x.score >= Number(form.pass_mark) ? 'পাস' : 'ফেল'}</span>}</> : <span className="badge mid">দিচ্ছে…</span>}</td>
                  <td className="small">{x.status === 'submitted' ? <><span className="tone-good">{bn(x.correct)}</span> / <span className="tone-bad">{bn(x.wrong)}</span> / {bn(x.skipped)}</> : '—'}</td>
                  <td className="small">{x.time_sec != null ? fmtTime(x.time_sec) : '—'}</td>
                  <td className="tiny muted">{fmtDate(x.submitted_at || x.started_at)}</td>
                  <td className="row nowrap">{x.status === 'submitted' && <button className="btn small light" onClick={() => setOpen(x.id)}>উত্তরপত্র</button>}
                    <button className="icon danger" onClick={() => remove(x)} title="মুছুন">🗑</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )
      ) : (
        <div className="stack">{stats.map((q, i) => {
          const n = q.correct + q.wrong + q.skipped || 1;
          return (
            <div key={q.id} className="card stack tight">
              <div className="row"><b>{bn(i + 1)}. {q.body}</b><span className="spacer" /><span className={`badge ${q.correct / n >= 0.6 ? 'good' : q.correct / n >= 0.3 ? 'mid' : 'bad'}`}>{bn(Math.round((q.correct / n) * 100))}% সঠিক</span></div>
              <div className="bar3"><span className="g" style={{ width: `${(q.correct / n) * 100}%` }} /><span className="r" style={{ width: `${(q.wrong / n) * 100}%` }} /></div>
              <div className="tiny muted">সঠিক {bn(q.correct)} · ভুল {bn(q.wrong)} · উত্তর দেয়নি {bn(q.skipped)}</div>
              {q.options && <div className="picks">{q.options.map((o, j) => (
                <div key={o.id} className={`pickrow ${q.answer.includes(o.id) ? 'right' : ''}`}><span>{LETTERS[j]}) {o.text || '🖼️'}</span>
                  <span className="minibar"><span style={{ width: `${((q.picks[o.id] || 0) / n) * 100}%` }} /></span><span className="tiny">{bn(q.picks[o.id] || 0)}</span></div>
              ))}</div>}
            </div>
          );
        })}</div>
      )}
      <Sheet formId={form.id} sid={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function Sheet({ formId, sid, onClose }) {
  const [d, setD] = useState(null);
  useEffect(() => { setD(null); if (sid) api(`/forms/${formId}/submissions/${sid}`).then(setD); }, [formId, sid]);
  return (
    <Modal open={!!sid} onClose={onClose} title={d ? `${d.name} — ${num(d.score)}/${num(d.total_marks)}` : 'উত্তরপত্র'} wide>
      {!d ? <div className="loader" /> : (
        <div className="stack">{d.questions.map((q, i) => (
          <div key={q.id} className={`review ${q.result.state}`}>
            <div className="row tiny"><span className={`badge ${q.result.state === 'correct' ? 'good' : q.result.state === 'wrong' ? 'bad' : 'mid'}`}>
              {q.result.state === 'correct' ? '✓ সঠিক' : q.result.state === 'wrong' ? '✗ ভুল' : 'উত্তর দেয়নি'}</span><span>{q.result.got > 0 ? '+' : ''}{num(q.result.got)}</span></div>
            <QuestionView q={q} n={bn(i + 1)} given={q.given} showAnswer />
          </div>
        ))}</div>
      )}
    </Modal>
  );
}
