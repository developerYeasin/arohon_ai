import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useFetch, useStartTest, Loader, ErrorBox, Empty, Modal } from '../components/ui.jsx';
import { bn, fmtDate } from '../utils.js';

const BN_LETTER = { a: 'ক', b: 'খ', c: 'গ', d: 'ঘ' };
const TYPE = { question_set: 'প্রশ্নসেট', model_test: 'মডেল টেস্ট' };
const Stars = ({ v }) => (v == null ? <span className="tiny muted">নতুন</span> : <span className="small">⭐ {bn(v)}</span>);

// ================= Student: store =================
export default function Market() {
  const { data, loading, error } = useFetch('/market/products');
  const [filter, setFilter] = useState('all');
  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  const list = data.filter((p) => filter === 'all' || (filter === 'free' ? p.price_bdt === 0 : filter === 'owned' ? p.owned : p.type === filter));
  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>🛒 বিশেষজ্ঞদের প্রশ্নসেট</h1><p>যাচাইকৃত শিক্ষক ও ক্যাডারদের তৈরি — প্রতিটি সেট প্রকাশের আগে আমাদের টিম পর্যালোচনা করে।</p></div>
        <div className="row"><Link className="btn light" to="/app/library">আমার লাইব্রেরি</Link><Link className="btn ghost" to="/app/creator">ক্রিয়েটর হোন</Link></div>
      </div>
      <div className="chips">{[['all', 'সব'], ['free', 'ফ্রি'], ['question_set', 'প্রশ্নসেট'], ['model_test', 'মডেল টেস্ট'], ['owned', 'কেনা']].map(([k, l]) => <button key={k} className={`chip ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>{l}</button>)}</div>
      {!list.length ? <div className="card"><Empty icon="🛒" title="এখনো কোনো সেট নেই">শিগগিরই বিশেষজ্ঞদের প্রশ্নসেট আসছে।</Empty></div> : (
        <div className="grid g3">{list.map((p) => (
          <Link key={p.id} to={`/app/market/${p.id}`} className="card exam-tile">
            <div className="row between"><span className="badge">{TYPE[p.type]}</span>{p.owned ? <span className="badge good">কেনা</span> : <b>{p.price_bdt ? `৳${bn(p.price_bdt)}` : 'ফ্রি'}</b>}</div>
            <b>{p.title}</b>
            <span className="small muted">{p.creator}{p.verified ? ' ✔' : ''} · {p.credential}</span>
            <div className="row between tiny muted"><span>{bn(p.questions)} প্রশ্ন · {bn(p.sales)} জন নিয়েছেন</span><Stars v={p.rating} /></div>
          </Link>
        ))}</div>
      )}
    </div>
  );
}

export function ProductPage() {
  const { id } = useParams();
  const { data: p, error, loading, reload } = useFetch(`/market/products/${id}`);
  const { data: me } = useFetch('/billing/me');
  const { start, busy, error: startErr } = useStartTest();
  const [buy, setBuy] = useState(false);
  const [review, setReview] = useState({ rating: 5, comment: '' });
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  if (loading && !p) return <Loader />;
  if (error) return <ErrorBox error={error} />;

  const claim = async () => { setErr(null); try { await api.post(`/market/products/${id}/claim`); reload(); } catch (e) { setErr(e); } };
  const sendReview = async () => { setErr(null); try { await api.post(`/market/products/${id}/review`, review); setMsg('রিভিউয়ের জন্য ধন্যবাদ!'); reload(); } catch (e) { setErr(e); } };

  return (
    <div className="stack">
      <div className="page-head">
        <div><span className="badge">{TYPE[p.type]}</span><h1 className="mt" style={{ marginTop: '.4rem' }}>{p.title}</h1><p>{p.exam || ''}{p.subject ? ` · ${p.subject}` : ''} · {bn(p.questions)} প্রশ্ন</p></div>
        <Link className="btn light" to="/app/market">← সব সেট</Link>
      </div>
      <ErrorBox error={err || startErr} />{msg && <div className="alert good">{msg}</div>}
      <div className="grid g-main">
        <div className="stack">
          <div className="card">
            <h3>বিবরণ</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{p.description || '—'}</p>
            {p.topics.length > 0 && <><b className="small">যে টপিকগুলো আছে</b><div className="chips mt">{p.topics.map((t) => <span key={t.name_bn} className="chip">{t.name_bn} ({bn(t.n)})</span>)}</div></>}
          </div>
          {!p.access && p.sample.length > 0 && (
            <div className="card">
              <h3>নমুনা প্রশ্ন</h3>
              {p.sample.map((q, i) => (
                <div key={q.id} className="qcard">
                  <div className="qbody mb">{bn(i + 1)}. {q.body}</div>
                  <div className="opts">{['a', 'b', 'c', 'd'].map((l) => <div key={l} className="opt"><span className="bubble">{BN_LETTER[l]}</span>{q[`option_${l}`]}</div>)}</div>
                </div>
              ))}
            </div>
          )}
          <div className="card">
            <h3>রিভিউ {p.rating != null && <span className="small muted">⭐ {bn(p.rating)} ({bn(p.rating_count)})</span>}</h3>
            {p.access && p.my_attempts > 0 && (
              <div className="insight">
                <div style={{ flex: 1 }}>
                  <div className="chips">{[1, 2, 3, 4, 5].map((n) => <button key={n} className={`chip ${review.rating === n ? 'active' : ''}`} onClick={() => setReview({ ...review, rating: n })}>{'⭐'.repeat(n)}</button>)}</div>
                  <textarea className="input mt" placeholder="সেটটি কেমন লাগল? প্রশ্নের মান, ব্যাখ্যা…" value={review.comment} onChange={(e) => setReview({ ...review, comment: e.target.value })} />
                  <button className="btn sm mt" onClick={sendReview}>{p.my_review ? 'রিভিউ হালনাগাদ' : 'রিভিউ দিন'}</button>
                </div>
              </div>
            )}
            {!p.reviews.length ? <p className="small muted">এখনো কোনো রিভিউ নেই।</p> : p.reviews.map((r, i) => (
              <div key={i} style={{ padding: '.45rem 0', borderBottom: '1px dashed var(--line)' }}><b className="small">{r.name}</b> <span className="small">{'⭐'.repeat(r.rating)}</span>{r.comment && <div className="small">{r.comment}</div>}</div>
            ))}
          </div>
        </div>
        <div className="stack">
          <div className="card" style={{ borderColor: 'var(--brand)', borderWidth: 2 }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{p.price_bdt ? `৳${bn(p.price_bdt)}` : 'ফ্রি'}</div>
            {p.access ? <>
              <span className="badge good">✓ আপনার লাইব্রেরিতে আছে</span>
              {p.my_attempts > 0 && <div className="small muted mt">{bn(p.my_attempts)} বার দিয়েছেন · সেরা স্কোর {bn(Number(p.my_best))}</div>}
              <button className="btn accent block mt" disabled={!!busy} onClick={() => start(`/market/products/${id}/start`, {}, 'go')}>{busy === 'go' ? 'প্রস্তুত হচ্ছে…' : p.type === 'model_test' ? 'মডেল টেস্ট দিন' : 'অনুশীলন শুরু করুন'}</button>
              {p.type === 'question_set' && <button className="btn ghost block mt" disabled={!!busy} onClick={() => start(`/market/products/${id}/start`, { timed: true }, 'timed')}>সময় ধরে পরীক্ষা মোডে দিন</button>}
            </> : p.price_bdt === 0
              ? <button className="btn accent block mt" onClick={claim}>ফ্রি নিন</button>
              : <button className="btn accent block mt" onClick={() => setBuy(true)}>কিনুন</button>}
            <p className="tiny muted mt">একবার কিনলে সারাজীবন ব্যবহার করতে পারবেন। ৭ দিনের মধ্যে রিফান্ড — <Link to="/terms">শর্তাবলি</Link></p>
          </div>
          <div className="card">
            <h3>ক্রিয়েটর</h3>
            <b>{p.creator}{p.verified ? <span className="badge good" style={{ marginLeft: 6 }}>✔ যাচাইকৃত</span> : null}</b>
            <div className="small muted">{p.credential}</div>
            {p.bio && <p className="small mt">{p.bio}</p>}
          </div>
        </div>
      </div>
      <Modal open={buy} onClose={() => setBuy(false)} title={`কিনুন — ৳${bn(p.price_bdt)}`}>{buy && me && <Checkout product={p} methods={me.methods} onDone={(m) => { setBuy(false); setMsg(m); reload(); }} />}</Modal>
    </div>
  );
}

function Checkout({ product, methods, onDone }) {
  const [method, setMethod] = useState(methods[0]?.code);
  const [trx, setTrx] = useState('');
  const [sender, setSender] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const m = methods.find((x) => x.code === method);
  if (!methods.length) return <div className="alert warn">এই মুহূর্তে অনলাইন পেমেন্ট চালু নেই।</div>;
  const pay = async () => {
    setBusy(true); setErr(null);
    try {
      const d = await api.post('/billing/checkout', { product_id: product.id, method, trx_id: trx, sender_number: sender });
      if (d.status === 'redirect') { window.location.href = d.url; return; }
      onDone(d.status === 'paid' ? '✅ কেনা হয়েছে — এখনই শুরু করতে পারেন।' : '✅ পেমেন্টের তথ্য জমা হয়েছে। যাচাইয়ের পর সেটটি আপনার লাইব্রেরিতে যোগ হবে।');
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <div className="stack">
      <ErrorBox error={err} />
      <div className="chips">{methods.map((x) => <button key={x.code} className={`chip ${method === x.code ? 'active' : ''}`} onClick={() => setMethod(x.code)}>{x.label}</button>)}</div>
      {m && !m.auto && <>
        <p className="small">{m.label.split(' ')[0]} থেকে <b>{bn(m.number)}</b> নম্বরে <b>৳{bn(product.price_bdt)}</b> Send Money করে TrxID দিন।</p>
        <input className="input" placeholder="TrxID" value={trx} onChange={(e) => setTrx(e.target.value)} />
        <input className="input" placeholder="যে নম্বর থেকে পাঠিয়েছেন (01XXXXXXXXX)" value={sender} onChange={(e) => setSender(e.target.value)} />
      </>}
      <button className="btn accent block" onClick={pay} disabled={busy || (m && !m.auto && (!trx || !sender))}>{busy ? 'অপেক্ষা করুন…' : `৳${bn(product.price_bdt)} পেমেন্ট করুন`}</button>
    </div>
  );
}

export function Library() {
  const { data, loading } = useFetch('/market/library');
  if (loading && !data) return <Loader />;
  return (
    <div className="stack">
      <div className="page-head"><div><h1>📚 আমার লাইব্রেরি</h1><p>যে সেটগুলো নিয়েছেন</p></div><Link className="btn ghost" to="/app/market">আরও সেট দেখুন</Link></div>
      {!data?.length ? <div className="card"><Empty icon="📚" title="এখনো কিছু নেননি"><Link to="/app/market">বিশেষজ্ঞদের প্রশ্নসেট দেখুন</Link></Empty></div> : (
        <div className="grid g3">{data.map((p) => (
          <Link key={p.id} to={`/app/market/${p.id}`} className="card exam-tile"><span className="badge">{TYPE[p.type]}</span><b>{p.title}</b><span className="small muted">{p.creator} · {fmtDate(p.created_at)}</span></Link>
        ))}</div>
      )}
    </div>
  );
}

// ================= Creator studio =================
const STATUS = { draft: ['খসড়া', 'gray'], review: ['পর্যালোচনাধীন', 'mid'], published: ['প্রকাশিত', 'good'], rejected: ['সংশোধন দরকার', 'bad'], unlisted: ['বন্ধ', 'gray'] };

export function CreatorStudio() {
  const nav = useNavigate();
  const { data, loading, reload } = useFetch('/market/creator/me');
  const { data: exams } = useFetch('/catalog/exams');
  const [newP, setNewP] = useState(null);
  const [err, setErr] = useState(null);
  if (loading && !data) return <Loader />;
  if (!data.profile || data.profile.status !== 'approved') return <CreatorApply profile={data.profile} onDone={reload} />;
  const e = data.earnings;
  const create = async () => {
    setErr(null);
    try { const d = await api.post('/market/creator/products', { ...newP, exam_id: Number(newP.exam_id) || null, price_bdt: Number(newP.price_bdt) || 0 }); nav(`/app/creator/${d.id}`); } catch (x) { setErr(x.message); }
  };
  return (
    <div className="stack">
      <div className="page-head"><div><h1>✍️ ক্রিয়েটর স্টুডিও</h1><p>{data.profile.display_name}{data.profile.verified ? ' ✔' : ''} · প্রতিটি বিক্রিতে আপনি পান {bn(Math.round(e.share * 100))}%</p></div>
        <button className="btn" onClick={() => setNewP({ title: '', type: 'question_set', track: 'job', exam_id: '', price_bdt: 0, description: '' })}>+ নতুন সেট</button></div>
      <div className="grid g4">
        {[['মোট বিক্রি', e.sales], ['মোট আয় (৳)', Math.round(e.earned)], ['পরিশোধিত (৳)', Math.round(e.paid)], ['পাওনা (৳)', Math.round(e.balance)]].map(([l, v]) => <div key={l} className="card stat"><span className="v">{bn(v)}</span><span className="l">{l}</span></div>)}
      </div>
      <div className="card table-wrap">
        <h3>আমার সেট</h3>
        {!data.products.length ? <p className="small muted">এখনো কোনো সেট নেই। "+ নতুন সেট" দিয়ে শুরু করুন।</p> : (
          <table className="table"><thead><tr><th>শিরোনাম</th><th>ধরন</th><th>প্রশ্ন</th><th>মূল্য</th><th>বিক্রি</th><th>অবস্থা</th><th /></tr></thead>
            <tbody>{data.products.map((p) => (
              <tr key={p.id}>
                <td><b>{p.title}</b>{p.admin_note && <div className="tiny muted">অ্যাডমিন: {p.admin_note}</div>}</td><td className="small">{TYPE[p.type]}</td><td>{bn(p.questions)}</td>
                <td>{p.price_bdt ? `৳${bn(p.price_bdt)}` : 'ফ্রি'}</td><td>{bn(p.sales)}</td>
                <td><span className={`badge ${STATUS[p.status][1]}`}>{STATUS[p.status][0]}</span></td>
                <td><Link className="btn light sm" to={`/app/creator/${p.id}`}>সম্পাদনা</Link></td>
              </tr>
            ))}</tbody></table>
        )}
      </div>
      {data.payouts.length > 0 && <div className="card"><h3>পরিশোধের ইতিহাস</h3>{data.payouts.map((x, i) => <div key={i} className="row between small" style={{ padding: '.3rem 0' }}><span>{fmtDate(x.created_at)} · {x.method || ''} {x.reference || ''}</span><b>৳{bn(Number(x.amount_bdt))}</b></div>)}</div>}
      <Modal open={!!newP} onClose={() => setNewP(null)} title="নতুন সেট">
        {newP && <div>
          <ErrorBox error={err} />
          <div className="field"><label>শিরোনাম</label><input className="input" value={newP.title} onChange={(x) => setNewP({ ...newP, title: x.target.value })} placeholder="যেমন: বাংলাদেশ বিষয়াবলি — ৩০০ বাছাইকৃত প্রশ্ন" /></div>
          <div className="grid g2">
            <div className="field"><label>ধরন</label><select className="input" value={newP.type} onChange={(x) => setNewP({ ...newP, type: x.target.value })}><option value="question_set">প্রশ্নসেট (অনুশীলন)</option><option value="model_test">মডেল টেস্ট (সময় ধরে)</option></select></div>
            <div className="field"><label>পরীক্ষা</label><select className="input" value={newP.exam_id} onChange={(x) => { const ex = exams?.find((y) => y.id === Number(x.target.value)); setNewP({ ...newP, exam_id: x.target.value, track: ex?.track || newP.track }); }}><option value="">—</option>{exams?.map((y) => <option key={y.id} value={y.id}>{y.name_bn}</option>)}</select></div>
            <div className="field"><label>মূল্য (৳, ০ = ফ্রি)</label><input type="number" className="input" value={newP.price_bdt} onChange={(x) => setNewP({ ...newP, price_bdt: x.target.value })} /></div>
          </div>
          <div className="field"><label>বিবরণ</label><textarea className="input" value={newP.description} onChange={(x) => setNewP({ ...newP, description: x.target.value })} /></div>
          <button className="btn block" onClick={create} disabled={!newP.title.trim()}>তৈরি করুন</button>
        </div>}
      </Modal>
    </div>
  );
}

function CreatorApply({ profile, onDone }) {
  const [f, setF] = useState({ display_name: profile?.display_name || '', credential: profile?.credential || '', bio: profile?.bio || '', evidence_url: profile?.evidence_url || '', payout_method: profile?.payout_method || 'bKash', payout_number: profile?.payout_number || '' });
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const send = async () => { setErr(null); try { await api.post('/market/creator/apply', f); onDone(); } catch (e) { setErr(e.message); } };
  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <div className="page-head"><div><h1>✍️ ক্রিয়েটর হোন</h1><p>আপনার তৈরি প্রশ্নসেট হাজারো শিক্ষার্থীর কাছে পৌঁছে দিন — প্রতিটি বিক্রিতে পান ৭০%।</p></div></div>
      {profile?.status === 'pending' && <div className="alert warn">আপনার আবেদন পর্যালোচনাধীন। অনুমোদন হলে এখানে স্টুডিও খুলবে।</div>}
      {profile?.status === 'rejected' && <div className="alert error">আবেদন গৃহীত হয়নি{profile.admin_note ? `: ${profile.admin_note}` : ''}। তথ্য হালনাগাদ করে আবার পাঠাতে পারেন।</div>}
      <div className="card">
        <ErrorBox error={err} />
        <div className="field"><label>প্রদর্শিত নাম</label><input className="input" value={f.display_name} onChange={set('display_name')} /></div>
        <div className="field"><label>যোগ্যতা</label><input className="input" value={f.credential} onChange={set('credential')} placeholder="যেমন: ৪৩তম বিসিএস (শিক্ষা), প্রভাষক — গণিত" /></div>
        <div className="field"><label>প্রমাণের লিংক (গেজেট/নিয়োগপত্র/প্রোফাইল)</label><input className="input" value={f.evidence_url} onChange={set('evidence_url')} /><small>যাচাইয়ের পর আপনার প্রোফাইলে "✔ যাচাইকৃত" ব্যাজ দেখাবে।</small></div>
        <div className="field"><label>আপনার সম্পর্কে</label><textarea className="input" value={f.bio} onChange={set('bio')} /></div>
        <div className="grid g2">
          <div className="field"><label>টাকা নেওয়ার মাধ্যম</label><select className="input" value={f.payout_method} onChange={set('payout_method')}>{['bKash', 'Nagad', 'Rocket', 'ব্যাংক'].map((x) => <option key={x}>{x}</option>)}</select></div>
          <div className="field"><label>নম্বর/অ্যাকাউন্ট</label><input className="input" value={f.payout_number} onChange={set('payout_number')} /></div>
        </div>
        <button className="btn" onClick={send} disabled={!f.display_name || !f.credential}>{profile ? 'আবেদন হালনাগাদ করুন' : 'আবেদন পাঠান'}</button>
      </div>
      <div className="card small">
        <b>নিয়ম</b>
        <ul style={{ margin: '.4rem 0 0', paddingLeft: '1.1rem' }}>
          <li>প্রতিটি প্রশ্নে ব্যাখ্যা বাধ্যতামূলক; প্রতি সেটে কমপক্ষে ১০টি প্রশ্ন।</li>
          <li>অন্যের বই/অ্যাপ থেকে কপি করা কনটেন্ট গ্রহণযোগ্য নয়।</li>
          <li>প্রকাশের আগে আমাদের টিম প্রতিটি সেট যাচাই করে; শিক্ষার্থীদের রিপোর্ট থেকেও সংশোধন হয়।</li>
        </ul>
      </div>
    </div>
  );
}

export function CreatorProduct() {
  const { id } = useParams();
  const { data: me, reload: reloadMe } = useFetch('/market/creator/me');
  const { data: qs, reload } = useFetch(`/market/creator/products/${id}/questions`);
  const { data: subjects } = useFetch('/catalog/subjects');
  const [q, setQ] = useState({ subject_id: '', topic_id: '', body: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_option: 'a', explanation: '', difficulty: 3 });
  const { data: topics } = useFetch(q.subject_id ? `/catalog/subjects/${q.subject_id}/topics` : null, [q.subject_id]);
  const [bulk, setBulk] = useState(false);
  const [text, setText] = useState('');
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const p = me?.products.find((x) => x.id === Number(id));
  if (!me || !qs) return <Loader />;
  if (!p) return <ErrorBox error="সেট পাওয়া যায়নি" />;
  const editable = ['draft', 'rejected'].includes(p.status);
  const run = async (fn, m) => { setErr(null); setMsg(null); try { await fn(); setMsg(m); reload(); reloadMe(); } catch (e) { setErr(e.message); } };
  const set = (k) => (e) => setQ({ ...q, [k]: e.target.value });
  const add = () => run(async () => { await api.post(`/market/creator/products/${id}/questions`, q); setQ({ ...q, body: '', option_a: '', option_b: '', option_c: '', option_d: '', explanation: '' }); }, 'প্রশ্ন যোগ হয়েছে');
  const addBulk = () => run(async () => {
    let list; try { list = JSON.parse(text); } catch { throw new Error('JSON সঠিক নয়'); }
    const d = await api.post(`/market/creator/products/${id}/questions`, list); setText(''); setBulk(false); setMsg(`${d.added}টি প্রশ্ন যোগ হয়েছে`);
  }, 'ইমপোর্ট সম্পন্ন');

  return (
    <div className="stack">
      <div className="page-head">
        <div><span className={`badge ${STATUS[p.status][1]}`}>{STATUS[p.status][0]}</span><h1 className="mt" style={{ marginTop: '.4rem' }}>{p.title}</h1><p>{TYPE[p.type]} · {bn(qs.length)} প্রশ্ন · {p.price_bdt ? `৳${bn(p.price_bdt)}` : 'ফ্রি'}</p></div>
        <div className="row">
          <Link className="btn light" to="/app/creator">← স্টুডিও</Link>
          {editable && <button className="btn accent" disabled={qs.length < 10} onClick={() => run(() => api.post(`/market/creator/products/${id}/submit`), 'পর্যালোচনায় পাঠানো হয়েছে — সাধারণত ২-৩ দিনের মধ্যে ফলাফল জানানো হয়')}>পর্যালোচনায় পাঠান</button>}
          {!editable && <button className="btn light" onClick={() => run(() => api.post(`/market/creator/products/${id}/draft`), 'খসড়ায় ফেরানো হয়েছে — এখন সম্পাদনা করতে পারবেন')}>খসড়ায় ফেরান</button>}
        </div>
      </div>
      {msg && <div className="alert good">{msg}</div>}<ErrorBox error={err} />
      {p.admin_note && <div className="alert warn">অ্যাডমিনের মন্তব্য: {p.admin_note}</div>}
      {editable && qs.length < 10 && <div className="alert small">পর্যালোচনায় পাঠাতে কমপক্ষে ১০টি প্রশ্ন লাগবে (এখন {bn(qs.length)}টি)।</div>}
      {!editable && <div className="alert small">পর্যালোচনাধীন/প্রকাশিত সেট সরাসরি সম্পাদনা করা যায় না। পরিবর্তন করতে "খসড়ায় ফেরান" — আগের ক্রেতারা অ্যাক্সেস হারাবেন না।</div>}

      {editable && (
        <div className="card">
          <div className="row between"><h3 style={{ margin: 0 }}>প্রশ্ন যোগ করুন</h3><button className="btn light sm" onClick={() => setBulk(true)}>JSON দিয়ে একসাথে</button></div>
          <div className="grid g2 mt">
            <div className="field"><label>বিষয়</label><select className="input" value={q.subject_id} onChange={(e) => setQ({ ...q, subject_id: e.target.value, topic_id: '' })}><option value="">—</option>{subjects?.map((s) => <option key={s.id} value={s.id}>{s.name_bn}</option>)}</select></div>
            <div className="field"><label>টপিক</label><select className="input" value={q.topic_id} onChange={set('topic_id')}><option value="">—</option>{topics?.map((t) => <option key={t.id} value={t.id}>{t.name_bn}</option>)}</select></div>
          </div>
          <div className="field"><label>প্রশ্ন</label><textarea className="input" value={q.body} onChange={set('body')} /></div>
          <div className="grid g2">{['a', 'b', 'c', 'd'].map((l) => <div key={l} className="field"><label>অপশন {BN_LETTER[l]}</label><input className="input" value={q[`option_${l}`]} onChange={set(`option_${l}`)} /></div>)}</div>
          <div className="grid g2">
            <div className="field"><label>সঠিক উত্তর</label><select className="input" value={q.correct_option} onChange={set('correct_option')}>{['a', 'b', 'c', 'd'].map((l) => <option key={l} value={l}>{BN_LETTER[l]}</option>)}</select></div>
            <div className="field"><label>কঠিনতা (১-৫)</label><input type="number" min="1" max="5" className="input" value={q.difficulty} onChange={set('difficulty')} /></div>
          </div>
          <div className="field"><label>ব্যাখ্যা (বাধ্যতামূলক)</label><textarea className="input" value={q.explanation} onChange={set('explanation')} /></div>
          <button className="btn" onClick={add} disabled={!q.topic_id || !q.body || !q.option_a || !q.option_b || !q.option_c || !q.option_d || !q.explanation.trim()}>যোগ করুন</button>
        </div>
      )}

      <div className="card">
        <h3>সেটের প্রশ্ন ({bn(qs.length)})</h3>
        {!qs.length ? <p className="small muted">এখনো কোনো প্রশ্ন নেই।</p> : qs.map((x, i) => (
          <div key={x.id} style={{ padding: '.55rem 0', borderBottom: '1px dashed var(--line)' }}>
            <div className="row between"><b className="small">{bn(i + 1)}. {x.body}</b>{editable && <button className="linkbtn tiny" style={{ color: 'var(--bad)' }} onClick={() => run(() => api.del(`/market/creator/products/${id}/questions/${x.id}`), 'মুছে ফেলা হয়েছে')}>মুছুন</button>}</div>
            <div className="tiny muted">{x.topic} · সঠিক: {BN_LETTER[x.correct_option]}) {x[`option_${x.correct_option}`]}</div>
          </div>
        ))}
      </div>

      <Modal open={bulk} onClose={() => setBulk(false)} title="JSON দিয়ে প্রশ্ন যোগ" wide>
        <p className="small muted">প্রতিটি প্রশ্নে topic_id, body, option_a–d, correct_option (a/b/c/d) ও explanation দিন।</p>
        <textarea className="input" style={{ minHeight: 240, fontFamily: 'monospace', fontSize: '.85rem' }} value={text} onChange={(e) => setText(e.target.value)} placeholder='[{"topic_id": 1, "body": "…", "option_a": "…", "option_b": "…", "option_c": "…", "option_d": "…", "correct_option": "b", "explanation": "…"}]' />
        <button className="btn mt" onClick={addBulk} disabled={!text.trim()}>যোগ করুন</button>
      </Modal>
    </div>
  );
}
