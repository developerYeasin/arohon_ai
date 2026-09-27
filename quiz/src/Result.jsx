import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, bn, fmtTime, LETTER, signupUrl, store } from './lib.js';

function verdict(score, total) {
  const p = score / total;
  if (p >= 0.9) return 'অসাধারণ! 🔥';
  if (p >= 0.7) return 'খুব ভালো! 👏';
  if (p >= 0.5) return 'ভালো — আরেকটু চর্চা লাগবে';
  return 'চর্চা চালিয়ে যান 💪';
}

// 1080×1080 image for Facebook/WhatsApp status, drawn locally on a canvas.
function drawCard(r) {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1080;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 1080, 1080); grad.addColorStop(0, '#0f1535'); grad.addColorStop(1, '#2d3591');
  g.fillStyle = grad; g.fillRect(0, 0, 1080, 1080);
  g.textAlign = 'center'; g.fillStyle = '#fff';
  const f = (w, s) => `${w} ${s}px "Hind Siliguri", sans-serif`;
  g.font = f(700, 64); g.fillText('⛰️ আরোহণ কুইজ', 540, 170);
  g.font = f(400, 44); g.fillStyle = '#c3c7ee'; g.fillText(r.title, 540, 260);
  g.font = f(700, 260); g.fillStyle = '#fb923c'; g.fillText(`${bn(r.score)}/${bn(r.total)}`, 540, 560);
  g.font = f(600, 52); g.fillStyle = '#fff'; g.fillText(verdict(r.score, r.total), 540, 670);
  if (r.percentile != null) { g.font = f(400, 44); g.fillStyle = '#c3c7ee'; g.fillText(`আজ ${bn(r.percentile)}% জনের চেয়ে ভালো`, 540, 750); }
  g.font = f(700, 50); g.fillStyle = '#facc15'; g.fillText('আপনি কি আমাকে হারাতে পারবেন?', 540, 880);
  g.font = f(400, 36); g.fillStyle = '#c3c7ee'; g.fillText(`কোড: ${r.challenge_code}`, 540, 950);
  return c;
}

export default function Result() {
  const [r] = useState(() => { try { return JSON.parse(sessionStorage.getItem('quiz_result')); } catch { return null; } });
  const [nick, setNick] = useState(() => store.get('quiz_nick', ''));
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  if (!r) return <Navigate to="/" replace />;

  const link = `${window.location.origin}/c/${r.challenge_code}`;
  const msg = `আমি আরোহণ কুইজে "${r.title}"-এ পেয়েছি ${bn(r.score)}/${bn(r.total)} 🎯 তুমি কি আমাকে হারাতে পারবে? ${link}`;
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: 'আরোহণ কুইজ', text: msg, url: link }); return; } catch { /* cancelled */ } }
    try { await navigator.clipboard.writeText(msg); setCopied(true); } catch { /* blocked */ }
  };
  const download = () => {
    const a = document.createElement('a'); a.download = `arohon-quiz-${r.score}.png`; a.href = drawCard(r).toDataURL('image/png'); a.click();
  };
  const saveNick = async () => {
    store.set('quiz_nick', nick);
    await api(`/plays/${r.play_id}/nickname`, { nickname: nick }).catch(() => {});
    setSaved(true);
  };
  const beatChallenger = r.challenger && (r.score > r.challenger.score || (r.score === r.challenger.score && r.time_sec < r.challenger.time_sec));

  return (
    <div className="stack">
      <section className="card hero center stack" aria-live="polite">
        <div className="muted">{r.title}</div>
        <div className="score" style={{ color: '#fb923c' }}>{bn(r.score)}<span style={{ fontSize: '1.4rem', color: '#c3c7ee' }}> / {bn(r.total)}</span></div>
        <h2 style={{ margin: 0 }}>{verdict(r.score, r.total)}</h2>
        <div className="muted small">সময় {fmtTime(r.time_sec)} · {bn(r.players)} জন খেলেছেন{r.percentile != null ? ` · আপনি ${bn(r.percentile)}% জনের চেয়ে ভালো` : ''}</div>
        {r.challenger && <div className="pill" style={{ alignSelf: 'center' }}>{beatChallenger ? `🏆 আপনি ${r.challenger.name}-কে হারিয়েছেন!` : `${r.challenger.name} এগিয়ে (${bn(r.challenger.score)}) — আবার চেষ্টা করুন`}</div>}
      </section>

      <section className="card stack">
        <h2>📣 বন্ধুদের চ্যালেঞ্জ দিন</h2>
        <p className="muted small">একই ১০টি প্রশ্ন পাবে আপনার বন্ধু। দেখুন কে জেতে!</p>
        <div className="row">
          <button className="btn" onClick={share}>{copied ? '✓ কপি হয়েছে' : '🔗 শেয়ার করুন'}</button>
          <a className="btn wa" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">WhatsApp</a>
          <a className="btn fb" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`} target="_blank" rel="noreferrer">Facebook</a>
          <a className="btn ms" href={`fb-messenger://share/?link=${encodeURIComponent(link)}`}>Messenger</a>
          <button className="btn light" onClick={download}>🖼️ ছবি ডাউনলোড</button>
        </div>
      </section>

      {r.kind === 'daily' && (
        <section className="card stack">
          <h2>🏆 আজকের বোর্ডে নাম দিন</h2>
          {saved ? <p className="small" style={{ color: 'var(--good)' }}>✓ আপনার নাম বোর্ডে যোগ হয়েছে।</p> : (
            <div className="row">
              <label htmlFor="nick" className="sr-only" style={{ position: 'absolute', left: -9999 }}>ডাকনাম</label>
              <input id="nick" className="input" style={{ flex: 1, minWidth: 180 }} maxLength={30} placeholder="আপনার ডাকনাম" value={nick} onChange={(e) => setNick(e.target.value)} />
              <button className="btn" onClick={saveNick} disabled={!nick.trim()}>যোগ করুন</button>
            </div>
          )}
        </section>
      )}

      <section className="card center stack" style={{ borderColor: 'var(--accent)', borderWidth: 2 }}>
        <h2>কোন টপিকে দুর্বল, জানতে চান?</h2>
        <p className="muted">ফ্রি অ্যাকাউন্টে পাবেন রেডিনেস স্কোর, ভুলের কারণ বিশ্লেষণ, স্মার্ট রিভিশন আর প্রতিদিনের পরিকল্পনা।</p>
        <a className="btn accent" href={signupUrl('result')}>ফ্রি অ্যাকাউন্ট খুলুন — ৭ দিনের ট্রায়াল</a>
      </section>

      <section className="stack">
        <div className="row"><h2 style={{ margin: 0 }}>📝 উত্তর ও ব্যাখ্যা</h2><span className="spacer" /><button className="btn small light" onClick={() => setOpen(!open)}>{open ? 'লুকান' : 'সব দেখুন'}</button></div>
        {open && r.review.map((q, i) => (
          <div key={q.id} className="card stack">
            <div className="small muted">{bn(i + 1)}. {q.subject} {q.selected === q.correct ? '✓' : q.selected ? '✗' : '— বাদ'}</div>
            <div className="q" style={{ fontSize: '1.05rem' }}>{q.body}</div>
            <div className="opts">
              {['a', 'b', 'c', 'd'].map((l) => (
                <div key={l} className={`opt ${l === q.correct ? 'ok' : l === q.selected ? 'no' : ''}`}><span className="b">{LETTER[l]}</span>{q.options[l]}</div>
              ))}
            </div>
            {q.explanation && <div className="explain">{q.explanation}</div>}
          </div>
        ))}
      </section>

      <div className="row"><Link className="btn light" to="/">← হোম</Link><span className="spacer" /><Link className="btn" to="/">আরেকটা কুইজ</Link></div>
    </div>
  );
}
