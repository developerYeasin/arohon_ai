import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { WeekGoal } from './Planner.jsx';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useFetch, useStartTest, Loader, ErrorBox, Ring, Bar, Locked } from '../components/ui.jsx';
import { bn, pctText, fmtDate } from '../utils.js';

export const CONFIDENCE = { low: 'প্রাথমিক অনুমান — আরও অনুশীলনে নির্ভুল হবে', medium: 'মাঝারি নির্ভরযোগ্যতা', high: 'উচ্চ নির্ভরযোগ্যতা' };

export default function Dashboard() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const { data, error, loading, reload } = useFetch('/analytics/dashboard');
  const { start, busy, error: startErr } = useStartTest();
  const [badgesSeen, setBadgesSeen] = useState(false);

  useEffect(() => {
    const h = () => reload();
    window.addEventListener('arohon:target-changed', h);
    return () => window.removeEventListener('arohon:target-changed', h);
  }, [reload]);

  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  const r = data.readiness;
  const items = data.mission.items;
  const done = items.filter((i) => i.done).length;
  const totalMin = items.reduce((a, i) => a + i.minutes, 0);
  const newbie = !r || r.answers_used < 20;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>স্বাগতম, {user.name.split(' ')[0]} 👋</h1>
          <p>{r?.exam.name} · {data.days_left != null ? (data.days_left >= 0 ? `পরীক্ষার বাকি ${bn(data.days_left)} দিন` : 'পরীক্ষার তারিখ পেরিয়ে গেছে') : <Link to="/app/profile">পরীক্ষার তারিখ যোগ করুন</Link>}</p>
        </div>
        <div className="row">
          <span className="streak-pill">🔥 {bn(data.user.streak)} দিনের ধারা</span>
          <span className="xp-pill">লেভেল {bn(data.user.level)}</span>
        </div>
      </div>
      <ErrorBox error={startErr} />
      {!badgesSeen && data.new_badges?.length > 0 && (
        <div className="alert good row between">
          <span>🏅 নতুন অর্জন: {data.new_badges.map((b) => `${b.icon} ${b.bn}`).join(' · ')}</span>
          <span className="row"><Link to="/app/profile" className="small">সব অর্জন</Link><button className="btn light sm" onClick={() => { api.post('/analytics/badges/seen'); setBadgesSeen(true); }}>ঠিক আছে</button></span>
        </div>
      )}

      {(newbie || params.get('welcome')) && (
        <div className="card" style={{ borderColor: 'var(--accent)', borderWidth: 2 }}>
          <div className="row between">
            <div>
              <h3>🧭 প্রথম ধাপ: ২০ প্রশ্নের ডায়াগনস্টিক টেস্ট</h3>
              <p className="muted small" style={{ margin: 0 }}>এটি থেকেই তৈরি হবে আপনার রেডিনেস স্কোর, দুর্বল টপিকের তালিকা ও ব্যক্তিগত পরিকল্পনা। প্রায় ১৫ মিনিট লাগবে।</p>
            </div>
            <button className="btn accent" disabled={!!busy} onClick={() => start('/tests/adaptive', { count: 20 }, 'diag')}>{busy === 'diag' ? 'তৈরি হচ্ছে…' : 'শুরু করুন'}</button>
          </div>
        </div>
      )}

      <div className="grid g-main">
        <div className="card hero-card">
          <div className="row" style={{ gap: '1.4rem', alignItems: 'center' }}>
            <Ring value={r?.overall} dark sub="রেডিনেস" />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div className="muted small">{r?.exam.name} — সামগ্রিক প্রস্তুতি</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700 }}>আনুমানিক নম্বর: {r?.projected_marks == null && r?.locked ? <Link to="/app/billing" style={{ color: '#fcd34d' }}>🔒 আনলক করুন</Link> : <>{bn(r?.projected_marks)} / {bn(r?.exam.total_questions)}</>}</div>
              <div className="tiny muted">{CONFIDENCE[r?.confidence]} · {bn(r?.answers_used)}টি উত্তরের ভিত্তিতে</div>
              {r?.biggest_risk && <div className="small mt" style={{ color: '#fcd34d' }}>⚠ সবচেয়ে বড় ঝুঁকি: {r.biggest_risk.text}</div>}
              {r?.recommended_action && <div className="small" style={{ color: '#c7d2fe' }}>→ {r.recommended_action.text}</div>}
              <div className="row mt">
                {r?.recommended_action?.type === 'topic' && <button className="btn accent sm" disabled={!!busy} onClick={() => start('/tests/adaptive', { topicIds: [r.recommended_action.topicId], count: 20, focus: 'weak' }, 'rec')}>রিকভারি শুরু করুন</button>}
                {r?.recommended_action?.type === 'speed_drill' && <button className="btn accent sm" disabled={!!busy} onClick={() => start('/tests/adaptive', { count: 20 }, 'rec')}>স্পিড ড্রিল</button>}
                {r?.recommended_action?.type === 'mock' && <button className="btn accent sm" disabled={!!busy} onClick={() => start('/tests/mock', {}, 'rec')}>মডেল টেস্ট</button>}
                <Link className="btn light sm" to="/app/analytics">বিস্তারিত রিপোর্ট</Link>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="row between"><h3>🎯 আজকের মিশন</h3><span className="badge">{bn(totalMin)} মিনিট</span></div>
          <Bar value={items.length ? (done / items.length) * 100 : 0} tone="good" />
          <div className="tiny muted mt" style={{ marginTop: '.3rem' }}>{done === items.length && items.length ? '✅ আজকের লক্ষ্য ১০০% সম্পন্ন — দারুণ! চাইলে বিশ্রাম নিন।' : `${bn(done)}/${bn(items.length)} সম্পন্ন`}</div>
          {items.map((it) => (
            <div key={it.key} className={`mission-item ${it.done ? 'done' : ''}`}>
              <span className="check">{it.done ? '✓' : ''}</span>
              <div style={{ flex: 1 }}><div className="t small" style={{ fontWeight: 600 }}>{it.title}</div><div className="tiny muted">~{bn(it.minutes)} মিনিট</div></div>
              {it.done
                ? (it.attempt_id && <Link className="btn light sm" to={`/app/result/${it.attempt_id}`}>ফলাফল</Link>)
                : <button className="btn sm" disabled={!!busy} onClick={() => start(`/tests/mission/${it.key}`, {}, it.key)}>{busy === it.key ? '…' : 'শুরু'}</button>}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="row between">
          <div><h3 style={{ margin: 0 }}>⏱️ হাতে কত সময় আছে?</h3><div className="small muted">সময় বলুন — আপনার দুর্বলতা ও রিভিশন মিলিয়ে সবচেয়ে কার্যকর সেশন তৈরি হবে।</div></div>
          <div className="chips">
            {[15, 30, 45, 60, 120].map((m) => (
              <button key={m} className="chip" disabled={!!busy} onClick={() => start('/tests/session', { minutes: m }, `s${m}`)}>{busy === `s${m}` ? '…' : m >= 60 ? `${bn(m / 60)} ঘণ্টা` : `${bn(m)} মিনিট`}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid g-main">
        <WeekGoal progress={data.week_goal} compact onChange={() => reload()} />
        <div className="card"><h3>🗓️ এই সপ্তাহের পরিকল্পনা</h3><p className="small muted">কোন দিন কোন বিষয়, কবে মডেল টেস্ট — আপনার দুর্বলতা ও পরীক্ষার নম্বর বণ্টন অনুযায়ী।</p><Link className="btn ghost sm" to="/app/planner">প্ল্যানার খুলুন</Link></div>
      </div>

      <div className="grid g4">
        <div className="card stat"><span className="v">{bn(data.due_reviews)}</span><span className="l">আজ রিভিশনের প্রশ্ন</span>{data.due_reviews > 0 && <button className="linkbtn small" onClick={() => start('/tests/revision', {}, 'rev')}>রিভিশন শুরু →</button>}</div>
        <div className="card stat"><span className="v">{bn(data.week.questions)}</span><span className="l">এই সপ্তাহে প্রশ্ন</span></div>
        <div className="card stat"><span className="v">{bn(data.week.tests)}</span><span className="l">এই সপ্তাহে টেস্ট</span></div>
        <div className="card stat"><span className="v">{bn(data.user.best_streak)}</span><span className="l">সেরা ধারা (দিন)</span></div>
      </div>

      <div className="grid g2">
        <div className="card">
          <h3>📚 বিষয়ভিত্তিক প্রস্তুতি</h3>
          <div className="tiny muted mb">বার = প্রস্তুতি (নির্ভুলতা × সিলেবাস কভারেজ) · ডানে পরীক্ষায় প্রশ্নসংখ্যা</div>
          {r?.subjects.map((s) => (
            <div key={s.id} className="subject-row">
              <span>{s.name}</span>
              <Bar value={s.readiness} />
              <span className="small" style={{ textAlign: 'right' }}>{s.attempts ? pctText(s.readiness) : <span className="muted">—</span>}</span>
            </div>
          ))}
        </div>
        <div className="stack">
          <div className="card">
            <h3>🩹 নির্দিষ্ট দুর্বলতা</h3>
            {r?.weak_topics.length ? (
              <>
                <p className="small muted">আপনি পুরো বিষয়ে দুর্বল নন — নির্দিষ্টভাবে এই টপিকগুলোতে:</p>
                {r.weak_topics.map((t) => (
                  <div key={t.id} className="row between" style={{ padding: '.35rem 0' }}>
                    <span className="small"><b>{t.name}</b> <span className="muted">· নির্ভুলতা {pctText(t.accuracy)} ({bn(t.attempts)} উত্তর)</span></span>
                    <button className="btn ghost sm" disabled={!!busy} onClick={() => start('/tests/adaptive', { topicIds: [t.id], count: 15, focus: 'weak' }, `t${t.id}`)}>অনুশীলন</button>
                  </div>
                ))}
                {r.hidden_weak_topics > 0 && <Locked title={`আরও ${bn(r.hidden_weak_topics)}টি দুর্বল টপিক শনাক্ত হয়েছে`} />}
              </>
            ) : <p className="small muted">কমপক্ষে ৩টি উত্তর দেওয়া টপিক থেকে দুর্বলতা শনাক্ত হয়। আরও অনুশীলন করুন।</p>}
          </div>
          <div className="card">
            <div className="row between"><h3>🔴 আসন্ন লাইভ এক্সাম</h3><Link className="small" to="/app/live">সব দেখুন</Link></div>
            {data.live.length ? data.live.map((l) => (
              <div key={l.id} className="row between" style={{ padding: '.35rem 0' }}>
                <span className="small"><b>{l.title}</b><br /><span className="muted tiny">{fmtDate(l.starts_at, true)}</span></span>
                {new Date(l.starts_at) <= new Date() ? <Link className="btn danger sm" to={`/exam/${l.id}`}>অংশ নিন</Link> : <span className="badge gray">আসন্ন</span>}
              </div>
            )) : <p className="small muted">এই মুহূর্তে কোনো লাইভ এক্সাম নেই।</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
