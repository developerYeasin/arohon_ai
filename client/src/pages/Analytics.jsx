import { Link } from 'react-router-dom';
import { useFetch, useStartTest, Loader, ErrorBox, Ring, Bar, LineChart, Empty, Locked } from '../components/ui.jsx';
import { bn, pctText } from '../utils.js';
import { CONFIDENCE } from './Dashboard.jsx';

const DIMS = [
  ['subject_mastery', 'বিষয়ভিত্তিক দক্ষতা', 'সিলেবাসের নম্বর অনুযায়ী ভারযুক্ত'],
  ['accuracy', 'নির্ভুলতা', 'সাম্প্রতিক ৪০০ উত্তরে'],
  ['time_management', 'সময় ব্যবস্থাপনা', 'লক্ষ্য সময়ের মধ্যে উত্তরের হার'],
  ['consistency', 'ধারাবাহিকতা', 'শেষ টেস্টগুলোর স্কোরের স্থিরতা'],
  ['retention', 'মনে রাখা', 'রিভিশনে আগের ভুল প্রশ্নে সাফল্য'],
  ['simulation', 'পরীক্ষা সিমুলেশন', 'শেষ ৩টি টেস্টের গড়'],
];

export default function Analytics() {
  const { data: r, error, loading } = useFetch('/analytics/readiness');
  const { data: p } = useFetch('/analytics/progress?days=30');
  const { start, busy } = useStartTest();
  if (loading && !r) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  if (!r) return <Empty title="লক্ষ্য পরীক্ষা নির্বাচন করুন" />;

  const weekly = (() => {
    if (!p?.daily?.length) return null;
    const recent = p.daily.slice(-7), before = p.daily.slice(0, -7);
    const avg = (arr) => { const n = arr.reduce((a, d) => a + d.questions, 0); return n ? Math.round(arr.reduce((a, d) => a + d.accuracy * d.questions, 0) / n) : null; };
    return { recent: avg(recent), before: avg(before) };
  })();

  return (
    <div className="stack">
      <div className="page-head"><div><h1>রেডিনেস ও অগ্রগতি</h1><p>{r.exam.name} — {CONFIDENCE[r.confidence]} ({bn(r.answers_used)}টি উত্তর)</p></div></div>

      <div className="grid g-main">
        <div className="card">
          <div className="row" style={{ gap: '1.5rem' }}>
            <Ring value={r.overall} size={150} sub="সামগ্রিক রেডিনেস" />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div className="muted small">আনুমানিক প্রাপ্ত নম্বর (নেগেটিভ মার্কিংসহ)</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{r.projected_marks == null && r.locked ? '🔒' : bn(r.projected_marks)} / {bn(r.exam.total_questions)}</div>
              {r.weakest_subject && <div className="small">সবচেয়ে দুর্বল বিষয়: <b>{r.weakest_subject.name}</b>{r.weakest_topic ? <> → <b>{r.weakest_topic.name}</b></> : null}</div>}
              {r.biggest_risk && <div className="small tone-bad">সবচেয়ে বড় ঝুঁকি: {r.biggest_risk.text}</div>}
              <div className="small">পরামর্শ: {r.recommended_action.text}</div>
            </div>
          </div>
          <div className="grid g3 mt">
            {DIMS.map(([k, l, d]) => (
              <div key={k} className="dim"><div className={`v tone-${r.dimensions[k] == null ? 'muted' : r.dimensions[k] >= 70 ? 'good' : r.dimensions[k] >= 45 ? 'mid' : 'bad'}`}>{pctText(r.dimensions[k])}</div><div className="small" style={{ fontWeight: 600 }}>{l}</div><div className="tiny muted">{r.dimensions[k] == null ? (r.locked ? '🔒 এক্সাম পাসে দেখুন' : 'এখনো যথেষ্ট ডেটা নেই') : d}</div></div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>⚠️ ঝুঁকিসমূহ</h3>
          {r.risks.length ? r.risks.map((x) => <div key={x.key} className="insight warn small">{x.text}</div>) : <p className="small muted">বড় কোনো ঝুঁকি শনাক্ত হয়নি।</p>}
          {r.hidden_risks > 0 && <Locked title={`আরও ${bn(r.hidden_risks)}টি ঝুঁকি`} />}
          <h3 className="mt">🧠 ভুলের ধরন</h3>
          {r.locked ? <Locked title="ভুলের ধরন বিশ্লেষণ" /> : r.mistake_mix.length ? r.mistake_mix.slice(0, 5).map((m) => <div key={m.type} className="row between small" style={{ padding: '.2rem 0' }}><span>{m.label}</span><b>{bn(m.count)}</b></div>) : <p className="small muted">এখনো ডেটা নেই।</p>}
          <Link to="/app/mistakes" className="small">বিস্তারিত →</Link>
        </div>
      </div>

      <div className="card">
        <div className="row between"><h3>📈 আমি কি উন্নতি করছি?</h3>
          {weekly?.recent != null && weekly?.before != null && <span className={`badge ${weekly.recent >= weekly.before ? 'good' : 'bad'}`}>গত ৭ দিন {bn(weekly.recent)}% · আগে {bn(weekly.before)}%</span>}</div>
        {p?.daily?.length ? (
          <LineChart points={p.daily.map((d) => ({ value: d.accuracy, label: `${d.date} (${d.questions} প্রশ্ন)`, short: bn(d.date.slice(8)) }))} />
        ) : <p className="small muted">কয়েক দিন অনুশীলন করলে এখানে দৈনিক নির্ভুলতার প্রবণতা দেখাবে।</p>}
        {p?.tests?.length > 1 && <>
          <h3 className="mt">🏛️ টেস্ট স্কোরের প্রবণতা</h3>
          <LineChart points={p.tests.map((t, i) => ({ value: Math.max(0, t.pct), label: t.title, short: bn(i + 1) }))} />
        </>}
      </div>

      <div className="card">
        <h3>📚 বিষয় ও টপিক বিশ্লেষণ</h3>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>বিষয়</th><th>পরীক্ষায় প্রশ্ন</th><th style={{ width: 170 }}>প্রস্তুতি</th><th>নির্ভুলতা</th><th>কভারেজ</th><th /></tr></thead>
            <tbody>{r.subjects.map((s) => (
              <tr key={s.id}>
                <td><b>{s.name}</b></td><td>{bn(s.questions)}</td>
                <td><div className="row" style={{ flexWrap: 'nowrap' }}><div style={{ flex: 1 }}><Bar value={s.readiness} /></div><span className="small">{pctText(s.readiness)}</span></div></td>
                <td>{pctText(s.accuracy)} <span className="tiny muted">({bn(s.attempts)})</span></td>
                <td>{pctText(s.coverage)}</td>
                <td><button className="btn light sm" disabled={!!busy} onClick={() => start('/tests/adaptive', { subjectIds: [s.id], count: 20 }, `s${s.id}`)}>অনুশীলন</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {r.weak_topics.length > 0 && <>
          <h3 className="mt">🎯 টপিক-স্তরের দুর্বলতা</h3>
          <p className="small muted">"আপনি গণিতে দুর্বল" নয় — নির্দিষ্টভাবে কোথায়:</p>
          {r.hidden_weak_topics > 0 && <Locked title={`আরও ${bn(r.hidden_weak_topics)}টি দুর্বল টপিক`} />}
          <div className="chips mt">{r.weak_topics.map((t) => (
            <button key={t.id} className="chip" disabled={!!busy} onClick={() => start('/tests/adaptive', { topicIds: [t.id], count: 15, focus: 'weak' }, `t${t.id}`)}>{t.name} · {pctText(t.accuracy)}</button>
          ))}</div>
        </>}
      </div>
    </div>
  );
}
