import { Link } from 'react-router-dom';
import { useFetch, useStartTest, Loader, ErrorBox, Empty, Bar, Locked } from '../components/ui.jsx';
import { bn } from '../utils.js';

export default function Mistakes() {
  const { data, error, loading } = useFetch('/analytics/mistakes');
  const { start, busy, error: startErr } = useStartTest();
  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  const r = data.review;
  const maxType = Math.max(1, ...data.by_type.map((t) => t.count));

  return (
    <div className="stack">
      <div className="page-head"><div><h1>ভুল ও রিভিশন</h1><p>শুধু "ভুল প্রশ্নের ফোল্ডার" নয় — কেন ভুল হচ্ছে, আর কখন আবার দেখতে হবে।</p></div></div>
      <ErrorBox error={startErr} />

      <div className="card hero-card">
        <div className="row between">
          <div>
            <h3>🔁 স্মার্ট রিভিশন</h3>
            <p className="muted small" style={{ margin: 0 }}>
              {r.due_today ? `আজ ${bn(r.due_today)}টি প্রশ্ন রিভিশন দিলে সবচেয়ে বেশি লাভ — এগুলো ভুলে যাওয়ার সম্ভাবনা এখন সর্বোচ্চ।` : 'আজকের রিভিশন শেষ! পরের রিভিশন নির্ধারিত সময়ে আসবে।'}
            </p>
          </div>
          <button className="btn accent" disabled={!r.due_today || !!busy} onClick={() => start('/tests/revision', {}, 'rev')}>{busy === 'rev' ? '…' : 'আজকের রিভিশন শুরু'}</button>
        </div>
        <div className="grid g4 mt">
          {[['আজ', r.due_today], ['আগামীকাল', r.due_tomorrow], ['এই সপ্তাহে', r.due_week], ['আয়ত্তে এসেছে', r.mastered]].map(([l, v]) => (
            <div key={l} style={{ background: 'rgba(255,255,255,.08)', borderRadius: 12, padding: '.7rem' }}><div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{bn(v)}</div><div className="tiny muted">{l}</div></div>
          ))}
        </div>
        <p className="tiny muted mt" style={{ marginBottom: 0 }}>ভুল প্রশ্ন ১ দিন পর আসে; সঠিক হলে ৩ → ৭ → ১৬ → ৩৫ দিন পর। পাঁচবার টানা সঠিক হলে "আয়ত্তে এসেছে"।</p>
      </div>

      {data.total === 0 ? <div className="card"><Empty icon="🎉" title="এখনো কোনো ভুল রেকর্ড নেই">কয়েকটি টেস্ট দিলে এখানে আপনার ভুলের ধরন বিশ্লেষণ দেখাবে।</Empty></div> : (
        <div className="grid g2">
          <div className="card">
            <h3>🧠 ভুলের ধরন</h3>
            <p className="small muted">মোট {bn(data.total)}টি ভুল উত্তর বিশ্লেষণ। প্রতিটি ধরনের চিকিৎসা আলাদা।</p>
            {data.by_type.map((t) => (
              <div key={t.type} style={{ padding: '.55rem 0', borderBottom: '1px dashed var(--line)' }}>
                <div className="row between"><b className="small">{t.label}</b><span className="small">{bn(t.count)}টি</span></div>
                <Bar value={(t.count / maxType) * 100} tone="bad" />
                <div className="row between mt" style={{ marginTop: '.35rem' }}>
                  <span className="tiny muted" style={{ flex: 1 }}>{t.remedy}</span>
                  <button className="btn ghost sm" disabled={!!busy} onClick={() => start('/tests/mistakes', { type: t.type, count: 15 }, t.type)}>রি-টেস্ট</button>
                </div>
              </div>
            ))}
          </div>
          <div className="stack">
            <div className="card">
              <h3>📍 যে টপিকে সবচেয়ে বেশি ভুল</h3>
              {!data.pro && <Locked title="টপিকভিত্তিক ভুল বিশ্লেষণ">কোন টপিকে কোন ধরনের ভুল বেশি হচ্ছে</Locked>}
              {data.by_topic.map((t) => (
                <div key={t.topic_id} className="row between" style={{ padding: '.4rem 0', borderBottom: '1px dashed var(--line)' }}>
                  <span className="small"><b>{t.topic}</b> <span className="muted">· {t.subject}</span><br /><span className="tiny muted">{bn(t.count)} ভুল · প্রধান কারণ: {t.main_label}</span></span>
                  <button className="btn light sm" disabled={!!busy} onClick={() => start('/tests/adaptive', { topicIds: [t.topic_id], count: 15, focus: 'weak' }, `tp${t.topic_id}`)}>অনুশীলন</button>
                </div>
              ))}
            </div>
            <div className="card">
              <div className="row between"><h3>🔂 বারবার ভুল হওয়া প্রশ্ন</h3>
                {data.repeated.length > 0 && <button className="btn sm" disabled={!!busy} onClick={() => start('/tests/mistakes', { count: 20 }, 'rep')}>শুধু এগুলোতে টেস্ট</button>}</div>
              {!data.pro ? <Locked title="বারবার ভুল হওয়া প্রশ্নের তালিকা" /> : data.repeated.length === 0 ? <p className="small muted">কোনো প্রশ্নে দুবারের বেশি ভুল হয়নি।</p> : data.repeated.map((q) => (
                <div key={q.question_id} style={{ padding: '.4rem 0', borderBottom: '1px dashed var(--line)' }}>
                  <Link to={`/app/question/${q.question_id}`} className="small" style={{ color: 'var(--text)' }}>{q.body.length > 110 ? `${q.body.slice(0, 110)}…` : q.body}</Link>
                  <div className="tiny muted">{q.topic} · {bn(q.count)} বার ভুল</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
