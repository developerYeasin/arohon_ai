import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { useFetch, useStartTest, Loader, ErrorBox, Empty } from '../components/ui.jsx';
import { ReportButton, BookmarkButton, DiscussionButton, REPORT_REASONS } from '../components/QuestionTools.jsx';
import { bn, fmtDate, fmtDuration, TRACKS, DISTRICTS, KIND_LABEL } from '../utils.js';

const BN_LETTER = { a: 'ক', b: 'খ', c: 'গ', d: 'ঘ' };

export function CurrentAffairs() {
  const [cat, setCat] = useState('');
  const { data, error, loading } = useFetch(`/current-affairs${cat ? `?category=${encodeURIComponent(cat)}` : ''}`, [cat]);
  const { start, busy, error: startErr } = useStartTest();
  const cats = ['বাংলাদেশ', 'আন্তর্জাতিক', 'অর্থনীতি', 'বিজ্ঞান ও প্রযুক্তি', 'পরিবেশ', 'খেলাধুলা', 'পুরস্কার', 'নিয়োগ', 'সংস্থা', 'চুক্তি'];
  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>📰 সাম্প্রতিক বিষয়াবলি</h1><p>খবর → ব্যাখ্যা → মূল তথ্য → MCQ → সাপ্তাহিক টেস্ট — স্থির PDF নয়।</p></div>
        <button className="btn" disabled={!!busy} onClick={() => start('/tests/current-affairs', { count: 20 }, 'all')}>২০ প্রশ্নের সাপ্তাহিক টেস্ট</button>
      </div>
      <ErrorBox error={startErr} />
      <div className="chips"><button className={`chip ${!cat ? 'active' : ''}`} onClick={() => setCat('')}>সব</button>{cats.map((c) => <button key={c} className={`chip ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>{c}</button>)}</div>
      {loading && !data ? <Loader /> : error ? <ErrorBox error={error} /> : !data.length ? <div className="card"><Empty title="এই ক্যাটাগরিতে কিছু নেই" /></div> : data.map((c) => (
        <div key={c.id} className="card">
          <div className="row between"><span className="badge accent">{c.category}</span><span className="tiny muted">{fmtDate(c.published_on)}</span></div>
          <h3 className="mt" style={{ marginTop: '.5rem' }}>{c.title}</h3>
          <p className="small">{c.summary}</p>
          {c.key_facts?.length > 0 && <div className="explain"><b className="small">মনে রাখুন:</b><ul className="small" style={{ margin: '.3rem 0 0', paddingLeft: '1.1rem' }}>{c.key_facts.map((f) => <li key={f}>{f}</li>)}</ul></div>}
          {c.questions > 0 && <button className="btn ghost sm mt" disabled={!!busy} onClick={() => start('/tests/current-affairs', { currentAffairId: c.id, count: 5 }, c.id)}>{busy === c.id ? '…' : `${bn(c.questions)}টি প্রশ্নে যাচাই করুন`}</button>}
        </div>
      ))}
    </div>
  );
}

export function Intelligence() {
  const { user } = useAuth();
  const { data: exams } = useFetch('/catalog/exams');
  const [examId, setExamId] = useState(user.target_exam_id);
  const { data, error, loading } = useFetch(examId ? `/catalog/exams/${examId}/intelligence` : null, [examId]);
  const { start, busy } = useStartTest();
  const LABEL = { frequent: ['ঘন ঘন আসে', 'bad'], recurring: ['পুনরাবৃত্ত', 'mid'], emerging: ['নতুন প্রবণতা', 'accent'], rare: ['কদাচিৎ', 'gray'] };
  const total = data?.subjects.reduce((a, s) => a + s.question_count, 0) || 1;
  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>🔎 বিগত বছরের প্রশ্ন বিশ্লেষণ</h1><p>কোন টপিক কতবার এসেছে — প্রশ্ন শুধু জমা রাখা নয়, বিশ্লেষণ।</p></div>
        <select className="input" style={{ width: 'auto' }} value={examId || ''} onChange={(e) => setExamId(Number(e.target.value))} aria-label="পরীক্ষা">
          {exams?.map((e) => <option key={e.id} value={e.id}>{TRACKS[e.track].icon} {e.name_bn}</option>)}
        </select>
      </div>
      <div className="alert warn small">আমরা কখনো বলি না "এই প্রশ্ন নিশ্চিত আসবে"। এখানে দেখানো হয় ঐতিহাসিক পুনরাবৃত্তি ও সিলেবাস-গুরুত্ব — "উচ্চ অগ্রাধিকারের প্রস্তুতি এলাকা" হিসেবে।</div>
      {loading && !data ? <Loader /> : error ? <ErrorBox error={error} /> : <>
        <div className="card">
          <h3>📐 নম্বর বণ্টন (সিলেবাস)</h3>
          {data.subjects.map((s) => (
            <div key={s.id} className="subject-row" style={{ gridTemplateColumns: 'minmax(0,1fr) 2fr 60px' }}>
              <span>{s.name_bn}</span><div className="progress"><span style={{ width: `${(s.question_count / total) * 100}%` }} /></div><span className="small" style={{ textAlign: 'right' }}>{bn(s.question_count)}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>🔥 টপিকভিত্তিক পুনরাবৃত্তি</h3>
          {!data.topics.length ? <Empty icon="🗂️" title="এই পরীক্ষার জন্য এখনো বিগত বছরের প্রশ্ন যোগ হয়নি">অ্যাডমিন প্যানেল থেকে সাল (year) ও পরীক্ষার নাম (exam_ref) সহ প্রশ্ন ইমপোর্ট করলে এখানে ফ্রিকোয়েন্সি, প্রবণতা ও নতুন টপিক দেখাবে।</Empty> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>টপিক</th><th>বিষয়</th><th>কতবার</th><th>সময়কাল</th><th>ধরন</th><th /></tr></thead>
              <tbody>{data.topics.map((t) => (
                <tr key={t.id}>
                  <td><b>{t.name_bn}</b><div className="tiny muted">{t.exams}</div></td><td className="small">{t.subject}</td>
                  <td>{bn(t.times)} বার <span className="tiny muted">({bn(t.distinct_years)} বছরে)</span></td>
                  <td className="small">{bn(t.first_year)}–{bn(t.last_year)}</td>
                  <td><span className={`badge ${LABEL[t.label][1]}`}>{LABEL[t.label][0]}</span></td>
                  <td><button className="btn light sm" disabled={!!busy} onClick={() => start('/tests/practice', { topicIds: [t.id], count: 20, pyqOnly: true }, t.id)}>PYQ অনুশীলন</button></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      </>}
    </div>
  );
}

export function History() {
  const { data, error, loading } = useFetch('/attempts');
  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  return (
    <div className="stack">
      <div className="page-head"><div><h1>🗂️ পরীক্ষার ইতিহাস</h1><p>প্রতিটি টেস্টের পূর্ণ ডায়াগনস্টিক রিপোর্ট আবার দেখুন।</p></div></div>
      <div className="card table-wrap">
        {!data.length ? <Empty title="এখনো কোনো পরীক্ষা দেননি" /> : (
          <table className="table">
            <thead><tr><th>পরীক্ষা</th><th>ধরন</th><th>স্কোর</th><th>সঠিক/ভুল/বাদ</th><th>সময়</th><th>তারিখ</th></tr></thead>
            <tbody>{data.map((a) => (
              <tr key={a.id}>
                <td><Link to={`/app/result/${a.id}`}>{a.title}</Link></td><td><span className="badge gray">{KIND_LABEL[a.kind]}</span></td>
                <td><b>{bn(Number(a.score))}</b>/{bn(a.total)}</td><td>{bn(a.correct)}/{bn(a.wrong)}/{bn(a.skipped)}</td>
                <td>{fmtDuration(a.time_spent_sec)}</td><td className="small">{fmtDate(a.submitted_at, true)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function Bookmarks() {
  const { data, error, loading } = useFetch('/bookmarks');
  const [show, setShow] = useState({});
  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  return (
    <div className="stack">
      <div className="page-head"><div><h1>🔖 সংরক্ষিত প্রশ্ন</h1><p>গুরুত্বপূর্ণ প্রশ্নগুলো এক জায়গায়।</p></div></div>
      {!data.length ? <div className="card"><Empty title="কোনো সংরক্ষিত প্রশ্ন নেই">রিপোর্ট পাতায় 🔖 চাপলে এখানে জমা হবে।</Empty></div> : data.map((q) => (
        <div key={q.id} className="qcard">
          <div className="tiny muted">{q.subject} › {q.topic}</div>
          <div className="qbody mb">{q.body}</div>
          <div className="opts">{['a', 'b', 'c', 'd'].map((l) => <div key={l} className={`opt ${show[q.id] && q.correct_option === l ? 'correct' : ''}`}><span className="bubble">{BN_LETTER[l]}</span>{q[`option_${l}`]}</div>)}</div>
          {show[q.id] && q.explanation && <div className="explain">{q.explanation}</div>}
          <div className="row mt">
            <button className="btn light sm" onClick={() => setShow({ ...show, [q.id]: !show[q.id] })}>{show[q.id] ? 'উত্তর লুকান' : 'উত্তর দেখুন'}</button>
            <BookmarkButton questionId={q.id} initial /><DiscussionButton questionId={q.id} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function QuestionPage() {
  const { id } = useParams();
  const { data, error, loading } = useFetch(`/questions/${id}`);
  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  return (
    <div className="stack">
      <div className="qcard">
        <div className="tiny muted">{data.subject} › {data.topic} · কঠিনতা {bn(data.difficulty)}/৫{data.exam_ref ? ` · ${data.exam_ref}` : ''}</div>
        <div className="qbody mb">{data.body}</div>
        <div className="opts">{['a', 'b', 'c', 'd'].map((l) => <div key={l} className={`opt ${data.correct === l ? 'correct' : ''}`}><span className="bubble">{BN_LETTER[l]}</span>{data.options[l]}</div>)}</div>
        {!data.revealed && <p className="small muted mt">এই প্রশ্নটি অনুশীলনে উত্তর দেওয়ার পর সঠিক উত্তর ও ব্যাখ্যা দেখতে পাবেন।</p>}
        {data.explanation && <div className="explain">{data.explanation}</div>}
        <div className="qmeta">
          {data.source && <span className="badge gray">সূত্র: {data.source}</span>}
          <span className="badge gray">সংস্করণ {bn(data.version)}</span>
          {data.last_verified_at && <span className="badge good">যাচাই: {fmtDate(data.last_verified_at)}</span>}
          {data.status === 'needs_review' && <span className="badge mid">পর্যালোচনাধীন</span>}
          {data.stats.attempts > 0 && <span className="badge">সঠিক হার {bn(data.stats.accuracy)}% · {bn(data.stats.attempts)} উত্তর</span>}
        </div>
        <div className="row mt"><BookmarkButton questionId={data.id} /><DiscussionButton questionId={data.id} /><ReportButton questionId={data.id} /></div>
      </div>
      {data.history.length > 1 && <div className="card"><h3>📜 সংশোধনের ইতিহাস</h3>{data.history.map((h) => <div key={h.version} className="small">সংস্করণ {bn(h.version)} — {h.change_note} <span className="muted">({fmtDate(h.changed_at)})</span></div>)}</div>}
      {data.related.length > 0 && <div className="card"><h3>🔗 একই টপিকের প্রশ্ন</h3>{data.related.map((r) => <div key={r.id} className="small" style={{ padding: '.3rem 0' }}><Link to={`/app/question/${r.id}`}>{r.body}</Link></div>)}</div>}
    </div>
  );
}

function Badges() {
  const { data } = useFetch('/analytics/badges');
  if (!data) return null;
  const earned = data.filter((b) => b.earned_at).length;
  return (
    <div className="card">
      <h3>🏅 অর্জন <span className="small muted" style={{ fontWeight: 400 }}>{bn(earned)}/{bn(data.length)}</span></h3>
      <p className="small muted">অর্জন আসে ধারাবাহিকতা, নির্ভুলতা, ভুল থেকে শেখা ও অন্যকে সাহায্য করা থেকে — শুধু বেশি সময় অ্যাপে থাকা থেকে নয়।</p>
      <div className="grid g3">
        {data.map((b) => (
          <div key={b.code} className="dim" style={{ opacity: b.earned_at ? 1 : 0.45 }} title={b.desc}>
            <div style={{ fontSize: '1.4rem' }}>{b.icon}</div>
            <b className="small">{b.bn}</b>
            <div className="tiny muted">{b.desc}</div>
            {b.earned_at && <div className="tiny tone-good">✓ {fmtDate(b.earned_at)}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ChangePassword() {
  const [f, setF] = useState({ current: '', password: '' });
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const save = async (e) => {
    e.preventDefault(); setMsg(null); setErr(null);
    try { await api.post('/auth/change-password', f); setMsg('পাসওয়ার্ড বদলানো হয়েছে'); setF({ current: '', password: '' }); } catch (e2) { setErr(e2.message); }
  };
  return (
    <form className="card" onSubmit={save}>
      <h3>🔑 পাসওয়ার্ড বদলান</h3>
      {msg && <div className="alert good">{msg}</div>}<ErrorBox error={err} />
      <div className="field"><label htmlFor="cp1">বর্তমান পাসওয়ার্ড</label><input id="cp1" type="password" className="input" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} autoComplete="current-password" /></div>
      <div className="field"><label htmlFor="cp2">নতুন পাসওয়ার্ড</label><input id="cp2" type="password" className="input" minLength={6} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></div>
      <button className="btn" disabled={!f.current || f.password.length < 6}>বদলান</button>
    </form>
  );
}

export function Profile() {
  const { user, updateProfile } = useAuth();
  const { data: exams } = useFetch('/catalog/exams');
  const { data: reports } = useFetch('/my-reports');
  const [f, setF] = useState({ name: user.name, target_exam_id: user.target_exam_id || '', exam_date: user.exam_date || '', district: user.district || '', institution: user.institution || '', daily_minutes: user.daily_minutes, show_on_leaderboard: !!user.show_on_leaderboard });
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async (e) => {
    e.preventDefault(); setMsg(null); setErr(null);
    try { await updateProfile({ ...f, target_exam_id: Number(f.target_exam_id) || null, daily_minutes: Number(f.daily_minutes), show_on_leaderboard: f.show_on_leaderboard ? 1 : 0 }); setMsg('সংরক্ষিত হয়েছে। আজকের মিশন নতুন লক্ষ্য অনুযায়ী আপডেট হবে।'); }
    catch (e2) { setErr(e2.message); }
  };
  const STATUS = { open: ['পর্যালোচনাধীন', 'mid'], verified_ok: ['যাচাই: প্রশ্ন সঠিক', 'gray'], fixed: ['সংশোধিত ✓', 'good'], rejected: ['বাতিল', 'gray'] };
  return (
    <div className="stack">
    <div className="grid g2">
      <form className="card" onSubmit={save}>
        <h3>⚙️ প্রোফাইল ও লক্ষ্য</h3>
        {msg && <div className="alert good">{msg}</div>}<ErrorBox error={err} />
        <div className="field"><label htmlFor="pn">নাম</label><input id="pn" className="input" value={f.name} onChange={set('name')} /></div>
        <div className="field"><label htmlFor="pe">লক্ষ্য পরীক্ষা</label>
          <select id="pe" className="input" value={f.target_exam_id} onChange={set('target_exam_id')}>
            {['job', 'admission', 'academic'].map((t) => <optgroup key={t} label={TRACKS[t].bn}>{exams?.filter((e) => e.track === t).map((e) => <option key={e.id} value={e.id}>{e.name_bn}</option>)}</optgroup>)}
          </select>
          <small>একাডেমিক → ভর্তি → চাকরি: লক্ষ্য বদলালেও আপনার সব ইতিহাস থেকে যায়।</small>
        </div>
        <div className="field"><label htmlFor="pd">আপনার পরীক্ষার তারিখ</label><input id="pd" type="date" className="input" value={f.exam_date || ''} onChange={set('exam_date')} /><small>কাউন্টডাউন ও কোচের পরিকল্পনায় ব্যবহৃত হয়</small></div>
        <div className="field"><label htmlFor="pm">দৈনিক পড়ার সময় (মিনিট)</label>
          <select id="pm" className="input" value={f.daily_minutes} onChange={set('daily_minutes')}>{[20, 30, 45, 60, 90, 120, 180, 240].map((m) => <option key={m} value={m}>{bn(m)}</option>)}</select></div>
        <div className="grid g2">
          <div className="field"><label htmlFor="pdi">জেলা</label><select id="pdi" className="input" value={f.district} onChange={set('district')}><option value="">—</option>{DISTRICTS.map((d) => <option key={d}>{d}</option>)}</select></div>
          <div className="field"><label htmlFor="pi">প্রতিষ্ঠান</label><input id="pi" className="input" value={f.institution} onChange={set('institution')} /></div>
        </div>
        <label className="row small mb"><input type="checkbox" checked={f.show_on_leaderboard} onChange={set('show_on_leaderboard')} /> লিডারবোর্ডে আমার নাম দেখাও</label>
        <button className="btn">সংরক্ষণ করুন</button>
      </form>
      <div className="card">
        <h3>⚠ আমার রিপোর্ট করা প্রশ্ন</h3>
        <p className="small muted">আপনার রিপোর্টের ফলাফল এখানে দেখুন — সংশোধন হলে প্রশ্নের সংস্করণ ইতিহাসে লেখা থাকে।</p>
        {!reports?.length ? <p className="small muted">কোনো রিপোর্ট নেই।</p> : reports.map((r) => (
          <div key={r.id} style={{ padding: '.45rem 0', borderBottom: '1px dashed var(--line)' }}>
            <Link to={`/app/question/${r.question_id}`} className="small">{r.body}</Link>
            <div className="row tiny"><span className="muted">{REPORT_REASONS[r.reason]}</span><span className={`badge ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span>{r.resolution_note && <span className="muted">— {r.resolution_note}</span>}</div>
          </div>
        ))}
      </div>
    </div>
    <Badges />
    <ChangePassword />
    </div>
  );
}
