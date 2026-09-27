import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useFetch, useStartTest, ErrorBox } from '../components/ui.jsx';

const PROMPTS = [
  'আজ কী পড়ব?', 'আমি কেন নম্বর হারাচ্ছি?', 'কোন টপিকগুলো রিভাইজ করব?', 'আমি কি উন্নতি করছি?', 'আমার সবচেয়ে দুর্বল জায়গা কোথায়?',
  '৩০ দিন বাকি, কী করব?', '১০ দিন বাকি, কী বাদ দেব?', '২ ঘণ্টার স্টাডি প্ল্যান দাও', 'বারবার ভুল করা প্রশ্নে টেস্ট নাও', '২০টি কঠিন প্রশ্ন দাও',
];

export default function Coach() {
  const { data: history } = useFetch('/coach/history');
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState(null);
  const { start, busy, error: startErr } = useStartTest();
  const nav = useNavigate();
  const logRef = useRef(null);

  useEffect(() => { if (history) setMsgs(history.map((h) => ({ role: h.role, content: h.content }))); }, [history]);
  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, [msgs]);

  const send = async (message) => {
    const m = (message ?? text).trim();
    if (!m || sending) return;
    setText(''); setErr(null); setSending(true);
    setMsgs((x) => [...x, { role: 'user', content: m }]);
    try {
      const d = await api.post('/coach', { message: m });
      setMsgs((x) => [...x, { role: 'assistant', content: d.text, actions: d.actions }]);
    } catch (e) { setErr(e); } finally { setSending(false); }
  };

  const runAction = (a) => {
    switch (a.type) {
      case 'adaptive': return start('/tests/adaptive', { topicIds: a.topicIds || [], count: a.count || 20, focus: a.focus || 'weak' }, a.label);
      case 'mistakes_test': return start('/tests/mistakes', { count: a.count || 20 }, a.label);
      case 'revision': return start('/tests/revision', {}, a.label);
      case 'session': return start('/tests/session', { minutes: a.minutes }, a.label);
      case 'mock': return start('/tests/mock', {}, a.label);
      case 'mistakes': return nav('/app/mistakes');
      case 'analytics': return nav('/app/analytics');
      default: return nav('/app');
    }
  };

  return (
    <div>
      <div className="page-head"><div><h1>🤖 পার্সোনাল এআই কোচ</h1><p>আপনার নিজের পারফরম্যান্স ডেটা দেখে পরামর্শ দেয় — সাধারণ চ্যাটবট নয়।</p></div></div>
      <ErrorBox error={err || startErr} />
      <div className="card chat">
        <div className="chat-log" ref={logRef} aria-live="polite">
          {msgs.length === 0 && (
            <div className="msg assistant">আসসালামু আলাইকুম! আমি আপনার প্রস্তুতি কোচ। আপনার রেডিনেস, দুর্বল টপিক, ভুলের ধরন আর পরীক্ষার বাকি সময় দেখে পরামর্শ দেব। নিচের যেকোনো প্রশ্ন দিয়ে শুরু করুন।</div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              {m.content}
              {m.actions?.length > 0 && (
                <div className="row mt">{m.actions.map((a) => <button key={a.label} className="btn sm" disabled={!!busy} onClick={() => runAction(a)}>{busy === a.label ? '…' : a.label}</button>)}</div>
              )}
            </div>
          ))}
          {sending && <div className="msg assistant muted">ভাবছি…</div>}
        </div>
        <div className="chips" style={{ padding: '.5rem 0', overflowX: 'auto', flexWrap: 'nowrap' }}>
          {PROMPTS.map((p) => <button key={p} className="chip" style={{ whiteSpace: 'nowrap' }} onClick={() => send(p)} disabled={sending}>{p}</button>)}
        </div>
        <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <label htmlFor="coach-in" className="sr-only">প্রশ্ন লিখুন</label>
          <input id="coach-in" className="input" placeholder="যেমন: আমার হাতে ৪০ মিনিট আছে" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn" disabled={sending || !text.trim()}>পাঠান</button>
        </form>
      </div>
    </div>
  );
}
