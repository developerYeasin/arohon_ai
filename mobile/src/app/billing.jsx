import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Badge, Btn, C, Card, Chip, ErrorBox, H3, Input, Loader, Row, Screen, T, bn, fmtDate, useFetch } from '../lib/ui';

const STATUS = { pending: 'যাচাই চলছে', paid: 'সফল', failed: 'ব্যর্থ', cancelled: 'বাতিল', rejected: 'প্রত্যাখ্যাত', refunded: 'ফেরত' };

export default function Billing() {
  const { refresh } = useAuth();
  const { data: me, loading, reload } = useFetch('/billing/me');
  const { data: cat } = useFetch('/billing/plans');
  const [plan, setPlan] = useState('pass_3m');
  const [method, setMethod] = useState(null);
  const [trx, setTrx] = useState('');
  const [sender, setSender] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  if (loading || !me || !cat) return <Loader />;
  const a = me.access;
  const m = me.methods.find((x) => x.code === method) || me.methods[0];
  const sel = cat.plans.find((p) => p.code === plan) || cat.plans[0];

  const pay = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const d = await api.post('/billing/checkout', { plan: sel.code, method: m.code, trx_id: trx, sender_number: sender });
      if (d.status === 'redirect') { await Linking.openURL(d.url); setMsg('bKash পেমেন্ট শেষে এই পাতায় ফিরে টেনে রিফ্রেশ করুন।'); }
      if (d.status === 'paid') setMsg('✅ এক্সাম পাস চালু হয়েছে!');
      if (d.status === 'pending') setMsg('✅ তথ্য জমা হয়েছে — যাচাইয়ের পর পাস চালু হবে।');
      setTrx(''); setSender(''); reload(); refresh();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <Card dark>
        <T light muted small>বর্তমান প্যাকেজ</T>
        <T light bold style={{ fontSize: 18 }}>{a.tier === 'pro' ? `⭐ ${a.plan_name}` : a.tier === 'trial' ? '🎁 ফ্রি ট্রায়াল' : a.tier === 'staff' ? 'স্টাফ' : 'ফ্রি প্যাকেজ'}</T>
        {a.until && <T light muted small>মেয়াদ: {fmtDate(a.until)} পর্যন্ত · অটো-রিনিউ নেই</T>}
      </Card>
      {msg && <Card style={{ backgroundColor: C.goodSoft }}><T>{msg}</T></Card>}
      <ErrorBox error={err} />
      <Card>
        <H3>১. প্যাকেজ</H3>
        {cat.plans.map((p) => (
          <Pressable key={p.code} onPress={() => setPlan(p.code)} style={{ borderWidth: 2, borderColor: sel.code === p.code ? C.brand : C.line, borderRadius: 12, padding: 12, backgroundColor: sel.code === p.code ? C.brandSoft : '#fff' }}>
            <Row between><T bold>{p.name_bn}</T><T bold style={{ fontSize: 18 }}>৳{bn(p.price_bdt)}</T></Row>
            {p.highlight && <Badge color="#c2410c" bg={C.accentSoft}>{p.highlight}</Badge>}
          </Pressable>
        ))}
      </Card>
      <Card>
        <H3>২. পেমেন্ট — ৳{bn(sel.price_bdt)}</H3>
        {!me.methods.length ? <T muted>এই মুহূর্তে পেমেন্ট চালু নেই।</T> : <>
          <Row>{me.methods.map((x) => <Chip key={x.code} label={x.label} active={m.code === x.code} onPress={() => setMethod(x.code)} />)}</Row>
          {m.auto ? <Btn title={`৳${bn(sel.price_bdt)} পেমেন্ট করুন`} kind="accent" busy={busy} onPress={pay} /> : (
            <View style={{ gap: 8 }}>
              <T small>১. {m.label.split(' ')[0]} থেকে <T small bold>{bn(m.number)}</T> নম্বরে ৳{bn(sel.price_bdt)} Send Money করুন</T>
              <T small>২. SMS-এর TrxID ও আপনার নম্বর দিন</T>
              <Input placeholder="TrxID" value={trx} onChangeText={setTrx} autoCapitalize="characters" />
              <Input placeholder="01XXXXXXXXX" value={sender} onChangeText={setSender} keyboardType="phone-pad" />
              <Btn title="তথ্য জমা দিন" kind="accent" busy={busy} disabled={!trx || !sender} onPress={pay} />
            </View>
          )}
        </>}
      </Card>
      {me.payments.length > 0 && (
        <Card>
          <H3>পেমেন্টের ইতিহাস</H3>
          {me.payments.map((p) => <Row key={p.id} between><T small style={{ flex: 1 }}>{p.plan_name} · ৳{bn(p.amount_bdt)}</T><Badge>{STATUS[p.status]}</Badge></Row>)}
        </Card>
      )}
    </Screen>
  );
}
