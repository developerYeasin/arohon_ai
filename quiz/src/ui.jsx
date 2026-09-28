import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { examUrl, LETTERS } from './lib.js';

export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <div className="row modal-head"><h3>{title}</h3><span className="spacer" /><button className="x" onClick={onClose} aria-label="বন্ধ">✕</button></div>
        {children}
      </div>
    </div>
  );
}

export function CopyLink({ code, compact }) {
  const [ok, setOk] = useState(false);
  const url = examUrl(code);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); } catch {
      const t = document.createElement('textarea'); t.value = url; document.body.append(t); t.select(); document.execCommand('copy'); t.remove();
    }
    setOk(true); setTimeout(() => setOk(false), 1500);
  };
  return (
    <div className={`copy ${compact ? 'compact' : ''}`}>
      <code>{url}</code>
      <button className="btn small" type="button" onClick={copy}>{ok ? '✓ কপি হয়েছে' : '🔗 কপি'}</button>
    </div>
  );
}

export function QR({ text, size = 200 }) {
  const [src, setSrc] = useState(null);
  useEffect(() => { QRCode.toDataURL(text, { width: size, margin: 1 }).then(setSrc).catch(() => setSrc(null)); }, [text, size]);
  return src ? <img src={src} width={size} height={size} alt="QR কোড" className="qr" /> : null;
}

// Read-only question with its options; `mark` highlights answers (review/staff view).
export function QuestionView({ q, n, given, showAnswer }) {
  const g = [].concat(given ?? []);
  return (
    <div className="qview">
      <div className="q">{n != null && <span className="qn">{n}.</span>} {q.body}</div>
      {q.image && <img className="qimg" src={q.image} alt="" />}
      {q.type === 'text' ? (
        <div className="small">
          {given != null && <div>প্রদত্ত উত্তর: <b>{String(given) || '—'}</b></div>}
          {showAnswer && <div className="tone-good">সঠিক উত্তর: <b>{q.answer.join(' / ')}</b></div>}
        </div>
      ) : (
        <div className="opts compact">
          {q.options.map((o, i) => {
            const right = showAnswer && q.answer.includes(o.id);
            const picked = g.includes(o.id);
            return (
              <div key={o.id} className={`opt static ${right ? 'ok' : picked && showAnswer ? 'no' : picked ? 'sel' : ''}`}>
                <span className="b">{LETTERS[i]}</span>
                <span className="grow">{o.text}{o.image && <img className="oimg" src={o.image} alt="" />}</span>
                {picked && <span className="tiny">আপনার উত্তর</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function download(name, text, type = 'text/csv;charset=utf-8') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
