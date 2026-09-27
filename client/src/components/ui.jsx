import { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import { bn, scoreTone } from '../utils.js';

export function useFetch(path, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    if (!path) { setLoading(false); return Promise.resolve(); }
    setLoading(true); setError(null);
    return api.get(path).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load, setData };
}

// Create a test on the server, then open the exam player.
export function useStartTest() {
  const nav = useNavigate();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const start = useCallback(async (endpoint, body = {}, key = endpoint) => {
    setBusy(key); setError(null);
    try {
      const d = await api.post(endpoint, body);
      nav(`/exam/${d.test_id}`);
    } catch (e) { setError(e); } finally { setBusy(null); }
  }, [nav]);
  return { start, busy, error, setError };
}

export const Loader = () => <div className="loader"><div className="spinner" aria-label="লোড হচ্ছে" /></div>;
// Accepts a string or an Error; "upgrade_required" errors get an upgrade call-to-action instead of a red box.
export function ErrorBox({ error }) {
  if (!error) return null;
  const msg = typeof error === 'string' ? error : error.message;
  if (error?.code === 'upgrade_required') {
    return (
      <div className="alert warn row between" role="alert">
        <span>🔒 {msg}</span>
        <Link className="btn accent sm" to="/app/billing">এক্সাম পাস নিন</Link>
      </div>
    );
  }
  return <div className="alert error" role="alert">{msg}</div>;
}

// Shown in place of a pro-only section for free users.
export function Locked({ title, children }) {
  return (
    <div className="locked">
      <div style={{ fontSize: '1.5rem' }}>🔒</div>
      <b>{title}</b>
      {children && <div className="small muted">{children}</div>}
      <Link className="btn accent sm mt" to="/app/billing">এক্সাম পাস দিয়ে আনলক করুন</Link>
    </div>
  );
}
export const Empty = ({ icon = '📭', title, children }) => (
  <div className="empty"><div className="icon">{icon}</div><div style={{ fontWeight: 600, color: 'var(--text)' }}>{title}</div>{children && <div className="small mt">{children}</div>}</div>
);

export function Ring({ value = 0, size = 132, stroke = 12, label, sub, dark = false }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value || 0));
  const color = { good: '#22c55e', mid: '#f59e0b', bad: '#ef4444', muted: '#9aa0cf' }[scoreTone(value)];
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={`${label || ''} ${v}%`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={dark ? 'rgba(255,255,255,.14)' : '#eceef6'} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset .6s' }} />
      </svg>
      <div className="ring-label"><div className="ring-value">{value == null ? '—' : `${bn(v)}%`}</div>{sub && <div className="ring-sub">{sub}</div>}</div>
    </div>
  );
}

export const Bar = ({ value, tone }) => (
  <div className={`progress ${tone || scoreTone(value)}`}><span style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} /></div>
);

export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between mb"><h3 style={{ margin: 0 }}>{title}</h3><button className="btn light sm" onClick={onClose} aria-label="বন্ধ করুন">✕</button></div>
        {children}
      </div>
    </div>
  );
}

// Simple SVG line chart for accuracy trends.
export function LineChart({ points, height = 160, max = 100, suffix = '%' }) {
  if (!points?.length) return null;
  const w = 600, pad = 28;
  const xs = (i) => pad + (i * (w - pad * 2)) / Math.max(1, points.length - 1);
  const ys = (v) => height - pad - (v / max) * (height - pad * 2);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${xs(i)},${ys(p.value)}`).join(' ');
  return (
    <div className="table-wrap">
      <svg viewBox={`0 0 ${w} ${height}`} style={{ width: '100%', minWidth: 320 }} role="img" aria-label="প্রবণতা চার্ট">
        {[0, 50, 100].map((g) => (
          <g key={g}><line x1={pad} x2={w - pad} y1={ys(g)} y2={ys(g)} stroke="#eceef6" /><text x={4} y={ys(g) + 4} fontSize="10" fill="#8a8fb0">{bn(g)}</text></g>
        ))}
        <path d={d} fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={xs(i)} cy={ys(p.value)} r="4" fill="#fff" stroke="#4f46e5" strokeWidth="2"><title>{`${p.label}: ${bn(p.value)}${suffix}`}</title></circle>
            {(points.length <= 12 || i % Math.ceil(points.length / 10) === 0) && <text x={xs(i)} y={height - 6} fontSize="10" textAnchor="middle" fill="#8a8fb0">{p.short || ''}</text>}
          </g>
        ))}
      </svg>
    </div>
  );
}
