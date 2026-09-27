import { useState } from 'react';
import { View } from 'react-native';
import { useAuth } from '../lib/auth';
import { Btn, C, Card, Chip, ErrorBox, H3, Input, Row, Screen, T, bn, useFetch } from '../lib/ui';

const TRACK_BN = { job: 'চাকরি', admission: 'ভর্তি', academic: 'একাডেমিক' };

export default function Profile() {
  const { user } = useAuth();
  return user ? <ProfileForm /> : null;
}

function ProfileForm() {
  const { user, updateProfile } = useAuth();
  const { data: exams } = useFetch('/catalog/exams');
  const { data: badges } = useFetch('/analytics/badges');
  const [f, setF] = useState({ name: user.name, target_exam_id: user.target_exam_id, exam_date: user.exam_date || '', daily_minutes: user.daily_minutes, district: user.district || '', institution: user.institution || '' });
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try { await updateProfile({ ...f, exam_date: /^\d{4}-\d{2}-\d{2}$/.test(f.exam_date) ? f.exam_date : null }); setMsg('সংরক্ষিত হয়েছে'); } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <Screen>
      <Card>
        {msg && <T style={{ color: C.good }}>{msg}</T>}
        <ErrorBox error={err} />
        <T bold>নাম</T><Input value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
        <T bold>লক্ষ্য পরীক্ষা</T>
        {['job', 'admission', 'academic'].map((t) => (
          <View key={t} style={{ gap: 4 }}><T small muted>{TRACK_BN[t]}</T>
            <Row>{exams?.filter((e) => e.track === t).map((e) => <Chip key={e.id} label={e.name_bn} active={f.target_exam_id === e.id} onPress={() => setF({ ...f, target_exam_id: e.id })} />)}</Row></View>
        ))}
        <T bold>পরীক্ষার তারিখ (YYYY-MM-DD)</T><Input value={f.exam_date} onChangeText={(v) => setF({ ...f, exam_date: v })} placeholder="2026-12-20" />
        <T bold>দৈনিক পড়ার সময়</T>
        <Row>{[30, 45, 60, 90, 120, 180].map((m) => <Chip key={m} label={`${bn(m)} মি.`} active={f.daily_minutes === m} onPress={() => setF({ ...f, daily_minutes: m })} />)}</Row>
        <T bold>জেলা</T><Input value={f.district} onChangeText={(v) => setF({ ...f, district: v })} />
        <T bold>প্রতিষ্ঠান</T><Input value={f.institution} onChangeText={(v) => setF({ ...f, institution: v })} />
        <Btn title="সংরক্ষণ করুন" busy={busy} onPress={save} />
      </Card>
      {badges && (
        <Card>
          <H3>🏅 অর্জন {bn(badges.filter((b) => b.earned_at).length)}/{bn(badges.length)}</H3>
          <Row>{badges.map((b) => (
            <View key={b.code} style={{ width: '47%', flexGrow: 1, opacity: b.earned_at ? 1 : 0.4, backgroundColor: '#f7f8fc', borderRadius: 10, padding: 8 }}>
              <T>{b.icon} <T small bold>{b.bn}</T></T><T small muted>{b.desc}</T>
            </View>
          ))}</Row>
        </Card>
      )}
    </Screen>
  );
}
