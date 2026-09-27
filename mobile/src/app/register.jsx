import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Btn, C, Card, Chip, ErrorBox, Input, Row, Screen, T } from '../lib/ui';

const TRACKS = { job: ['💼', 'চাকরি'], admission: ['🎓', 'ভর্তি'], academic: ['📘', 'একাডেমিক'] };
const normId = (v) => v.trim().replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d));

export default function Register() {
  const { register } = useAuth();
  const [exams, setExams] = useState([]);
  const [f, setF] = useState({ name: '', login: '', password: '', track: 'job', exam: null, ref: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { api.get('/catalog/exams').then(setExams).catch(() => {}); }, []);
  const trackExams = exams.filter((e) => e.track === f.track);

  const submit = async () => {
    setBusy(true); setErr(null);
    const id = normId(f.login);
    try {
      await register({ name: f.name, password: f.password, track: f.track, target_exam_id: f.exam || trackExams[0]?.id, ref: f.ref.trim() || undefined,
        ...(/^\+?[0-9]{10,14}$/.test(id) ? { phone: id } : { email: id }) });
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  return (
    <Screen>
      <Card>
        <ErrorBox error={err} />
        <T bold>আপনি কীসের প্রস্তুতি নিচ্ছেন?</T>
        <Row>
          {Object.entries(TRACKS).map(([k, [i, l]]) => (
            <Pressable key={k} onPress={() => setF({ ...f, track: k, exam: null })}
              style={{ flex: 1, minWidth: 90, alignItems: 'center', padding: 10, borderRadius: 12, borderWidth: 1.5, borderColor: f.track === k ? C.brand : C.line, backgroundColor: f.track === k ? C.brandSoft : '#fff' }}>
              <Text style={{ fontSize: 22 }}>{i}</Text><T bold small>{l}</T>
            </Pressable>
          ))}
        </Row>
        <T bold>লক্ষ্য পরীক্ষা</T>
        <Row>{trackExams.map((e) => <Chip key={e.id} label={e.name_bn} active={(f.exam || trackExams[0]?.id) === e.id} onPress={() => setF({ ...f, exam: e.id })} />)}</Row>
        <T bold>আপনার নাম</T>
        <Input value={f.name} onChangeText={(v) => setF({ ...f, name: v })} autoComplete="name" />
        <T bold>ইমেইল অথবা মোবাইল</T>
        <Input value={f.login} onChangeText={(v) => setF({ ...f, login: v })} autoCapitalize="none" />
        <T bold>পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)</T>
        <Input value={f.password} onChangeText={(v) => setF({ ...f, password: v })} secureTextEntry />
        <T bold>রেফারেল কোড (ঐচ্ছিক)</T>
        <Input value={f.ref} onChangeText={(v) => setF({ ...f, ref: v })} autoCapitalize="characters" />
        <View style={{ marginTop: 6 }}><Btn title="অ্যাকাউন্ট খুলুন — ৭ দিন ফ্রি ট্রায়াল" kind="accent" onPress={submit} busy={busy} disabled={!f.name || !f.login || f.password.length < 6} /></View>
      </Card>
    </Screen>
  );
}
