import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useFetch, useStartTest, Loader, ErrorBox, Bar, Locked } from '../components/ui.jsx';
import { ReportButton, BookmarkButton, DiscussionButton } from '../components/QuestionTools.jsx';
import { bn, fmtDuration, pctText, KIND_LABEL } from '../utils.js';

const BN_LETTER = { a: 'ক', b: 'খ', c: 'গ', d: 'ঘ' };
export const MISTAKE_LABELS = {
  didnt_know: 'জানা ছিল না', forgot: 'ভুলে গেছি', misread: 'প্রশ্ন ভুল পড়েছি', confused: 'দুটি ধারণা গুলিয়েছি', careless: 'অসাবধানতা',
  time_pressure: 'সময়ের চাপ', guessing: 'আন্দাজে উত্তর', calculation: 'হিসাবে ভুল', overthinking: 'বেশি ভেবেছি',
};

export default function Result() {
  const { attemptId } = useParams();
  const { refresh } = useAuth();
  const { data, error, loading, reload } = useFetch(`/attempts/${attemptId}/report`);
  const { start, busy, error: startErr } = useStartTest();
  const [filter, setFilter] = useState('wrong');
  const [share, setShare] = useState(null);

  useEffect(() => { refresh?.(); }, [refresh]);

  const list = useMemo(() => {
    if (!data) return [];
    if (filter === 'wrong') return data.answers.filter((a) => a.selected && a.is_correct === false);
    if (filter === 'skipped') return data.answers.filter((a) => !a.selected);
    if (filter === 'correct') return data.answers.filter((a) => a.is_correct);
    return data.answers;
  }, [data, filter]);

  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  const { attempt, test, ranking } = data;
  const pct = attempt.total ? Math.round((100 * attempt.score) / attempt.total) : 0;

  const setMistake = async (qid, type) => {
    await api.put(`/attempts/${attemptId}/answers/${qid}/mistake`, { type });
    reload();
  };
  const challenge = async () => {
    const d = await api.post(`/tests/${test.id}/challenge`);
    const url = `${window.location.origin}/exam/${d.test_id}`;
    const text = `আমি "${test.title}" এ পেয়েছি ${attempt.score}/${attempt.total}${ranking.rank ? ` (র‍্যাংক ${ranking.rank}/${ranking.participants})` : ''}। তুমি কি আমাকে হারাতে পারবে? ${url}`;
    setShare({ url, text });
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard may be blocked */ }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div><span className="badge">{KIND_LABEL[test.kind]}</span><h1 className="mt" style={{ marginTop: '.4rem' }}>{test.title}</h1><p>ডায়াগনস্টিক রিপোর্ট</p></div>
        <div className="row">
          <Link className="btn light" to="/app">ড্যাশবোর্ড</Link>
          {!data.results_hidden && <button className="btn ghost" onClick={challenge}>⚔️ বন্ধুকে চ্যালেঞ্জ</button>}
        </div>
      </div>
      <ErrorBox error={startErr} />
      {share && <div className="alert good">চ্যালেঞ্জ লিংক কপি হয়েছে — WhatsApp/Messenger এ পাঠিয়ে দিন:<div className="small mt" style={{ wordBreak: 'break-all' }}>{share.text}</div></div>}
      {data.results_hidden && <div className="alert warn">এটি একটি লাইভ এক্সাম। ন্যায্যতার জন্য সঠিক উত্তর ও ব্যাখ্যা পরীক্ষার সময় শেষ হওয়ার পর দেখানো হবে। আপনার স্কোর ও র‍্যাংক নিচে।</div>}

      <div className="grid g-main">
        <div className="card hero-card">
          <div className="row" style={{ gap: '1.5rem' }}>
            <div>
              <div className="muted small">প্রাপ্ত নম্বর</div>
              <div style={{ fontSize: '2.6rem', fontWeight: 700, lineHeight: 1.1 }}>{bn(attempt.score)}<span style={{ fontSize: '1.2rem', opacity: .7 }}> / {bn(attempt.total)}</span></div>
              <div className="small muted">{bn(pct)}% · সময় {fmtDuration(attempt.time_spent_sec)}</div>
            </div>
            <div className="grid g3" style={{ flex: 1, minWidth: 240 }}>
              <div><div className="muted tiny">সঠিক</div><b style={{ fontSize: '1.3rem', color: '#86efac' }}>{bn(attempt.correct)}</b></div>
              <div><div className="muted tiny">ভুল</div><b style={{ fontSize: '1.3rem', color: '#fca5a5' }}>{bn(attempt.wrong)}</b></div>
              <div><div className="muted tiny">উত্তর দেননি</div><b style={{ fontSize: '1.3rem' }}>{bn(attempt.skipped)}</b></div>
              {ranking.rank && <div><div className="muted tiny">মেধাক্রম</div><b style={{ fontSize: '1.3rem' }}>{bn(ranking.rank)}<span className="tiny"> / {bn(ranking.participants)}</span></b></div>}
              {ranking.percentile != null && <div><div className="muted tiny">পার্সেন্টাইল</div><b style={{ fontSize: '1.3rem' }}>{bn(ranking.percentile)}</b></div>}
              {test.negative_mark > 0 && <div><div className="muted tiny">নেগেটিভে কাটা</div><b style={{ fontSize: '1.3rem' }}>−{bn(attempt.wrong * test.negative_mark)}</b></div>}
            </div>
          </div>
          <div className="row mt">
            {['live', 'challenge', 'mock'].includes(test.kind) && <Link className="btn light sm" to={`/app/leaderboard/test/${test.id}`}>🏆 এই টেস্টের লিডারবোর্ড</Link>}
            <span className="tiny muted">+{bn(attempt.xp_earned)} XP অর্জিত</span>
          </div>
        </div>
        <div className="card">
          <h3>🔍 কেন এই ফলাফল</h3>
          {data.insights.map((i, k) => <div key={k} className={`insight ${i.tone}`}><span>{i.tone === 'good' ? '✅' : i.tone === 'warn' ? '⚠️' : 'ℹ️'}</span><span className="small">{i.text}</span></div>)}
          {data.hidden_insights > 0 && <Locked title={`আরও ${bn(data.hidden_insights)}টি ডায়াগনস্টিক ইনসাইট`}>কোথায় সময় নষ্ট হচ্ছে, শেষ দিকে নির্ভুলতা কমছে কি না, আন্দাজ লাভজনক কি না</Locked>}
        </div>
      </div>

      {!data.results_hidden && data.mistake_summary.length > 0 && (
        <div className="card">
          <div className="row between"><h3>🧠 ভুলের ধরন ও সমাধান</h3>
            <button className="btn sm" disabled={!!busy} onClick={() => start('/tests/mistakes', { count: 20 }, 'mt')}>ভুলগুলোর রি-টেস্ট</button></div>
          <div className="grid g3">
            {data.mistake_summary.map((m) => (
              <div key={m.type} className="dim"><div className="row between"><b>{m.label}</b><span className="badge bad">{bn(m.count)}</span></div><div className="small muted mt" style={{ marginTop: '.3rem' }}>{m.remedy || '🔒 সমাধান দেখতে এক্সাম পাস নিন'}</div></div>
            ))}
          </div>
          <p className="tiny muted mt">ভুলের কারণ স্বয়ংক্রিয়ভাবে অনুমান করা হয় (সময়, আত্মবিশ্বাস, আগের ইতিহাস দেখে)। নিচে প্রতিটি প্রশ্নে আপনি নিজে সঠিক কারণ বেছে দিতে পারেন।</p>
        </div>
      )}

      <div className="card">
        <h3>📚 বিষয়ভিত্তিক বিশ্লেষণ</h3>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>বিষয়</th><th>সঠিক/ভুল/বাদ</th><th style={{ width: 160 }}>নির্ভুলতা</th><th>গড় সময়</th><th>সময়ের ভাগ</th></tr></thead>
            <tbody>{data.subjects.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td><td>{bn(s.correct)}/{bn(s.wrong)}/{bn(s.skipped)}</td>
                <td>{data.results_hidden ? '—' : <div className="row" style={{ flexWrap: 'nowrap' }}><div style={{ flex: 1 }}><Bar value={s.accuracy} /></div><span className="small">{pctText(s.accuracy)}</span></div>}</td>
                <td className={s.avg_sec > data.target_sec * 1.3 ? 'tone-bad' : ''}>{bn(s.avg_sec)} সে.</td>
                <td>{bn(s.time_share)}% <span className="tiny muted">(প্রত্যাশিত {bn(s.expected_share)}%)</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="tiny muted mt">লক্ষ্য গতি: প্রতি প্রশ্নে {bn(data.target_sec)} সেকেন্ড</div>
      </div>

      <div className="card">
        <div className="row between mb">
          <h3 style={{ margin: 0 }}>📝 প্রশ্ন পর্যালোচনা</h3>
          <div className="chips">
            {[['wrong', 'ভুল'], ['skipped', 'বাদ'], ['correct', 'সঠিক'], ['all', 'সব']].map(([k, l]) => <button key={k} className={`chip ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>{l}</button>)}
          </div>
        </div>
        {list.length === 0 && <p className="muted small">এই তালিকায় কোনো প্রশ্ন নেই।</p>}
        {list.map((a) => (
          <div key={a.question_id} className="qcard">
            <div className="qhead">
              <span className="qnum">{bn(a.position)}</span>
              <div style={{ flex: 1 }}>
                <div className="tiny muted">{a.subject} › {a.topic} · {bn(a.time_sec)} সে.{a.confidence ? ` · ${{ sure: 'নিশ্চিত', unsure: 'অনিশ্চিত', guess: 'আন্দাজ' }[a.confidence]}` : ''}{a.global_accuracy != null ? ` · সবার সঠিক হার ${bn(a.global_accuracy)}%` : ''}</div>
                <div className="qbody">{a.body}</div>
              </div>
            </div>
            <div className="opts">
              {['a', 'b', 'c', 'd'].map((l) => {
                const cls = a.correct === l ? 'correct' : a.selected === l ? (data.results_hidden ? 'selected' : 'wrong') : '';
                return <div key={l} className={`opt ${cls}`}><span className="bubble">{BN_LETTER[l]}</span><span>{a.options[l]}</span></div>;
              })}
            </div>
            {a.explanation && <div className="explain">{a.explanation}</div>}
            <div className="qmeta">
              {a.source && <span className="badge gray">সূত্র: {a.source}</span>}
              {a.exam_ref && <span className="badge accent">{a.exam_ref}</span>}
            </div>
            {a.selected && a.is_correct === false && (
              <div className="row mt small">
                <label htmlFor={`mt${a.question_id}`} className="muted">ভুলের কারণ:</label>
                <select id={`mt${a.question_id}`} className="input" style={{ width: 'auto' }} value={a.mistake_type || ''} onChange={(e) => setMistake(a.question_id, e.target.value)}>
                  {Object.entries(MISTAKE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}{k === a.mistake_auto && !a.mistake_user ? ' (স্বয়ংক্রিয়)' : ''}</option>)}
                </select>
              </div>
            )}
            <div className="row mt">
              <BookmarkButton questionId={a.question_id} initial={a.bookmarked} />
              {!data.results_hidden && <DiscussionButton questionId={a.question_id} />}
              <ReportButton questionId={a.question_id} />
              {!data.results_hidden && <button className="btn light sm" disabled={!!busy} onClick={() => start('/tests/adaptive', { topicIds: [a.topic_id], count: 10 }, `tp${a.question_id}`)}>এই টপিকে আরও ১০টি</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
