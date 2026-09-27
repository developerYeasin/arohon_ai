import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Btn, C, Card, Chip, ErrorBox, H3, Loader, Row, Screen, T, bn, useFetch, useStartTest } from '../../lib/ui';

export default function Practice() {
  const { user } = useAuth();
  const { data: subjects, loading } = useFetch(`/catalog/subjects?exam_id=${user?.target_exam_id || ''}`);
  const { start, busy, error } = useStartTest();
  const [open, setOpen] = useState(null);
  const [topics, setTopics] = useState({});
  const [picked, setPicked] = useState([]);
  const [count, setCount] = useState(20);
  const [timed, setTimed] = useState(false);

  const toggle = async (s) => {
    setOpen(open === s.id ? null : s.id);
    if (!topics[s.id]) { const t = await api.get(`/catalog/subjects/${s.id}/topics`); setTopics((x) => ({ ...x, [s.id]: t })); }
  };
  const quick = [
    ['⚡', 'অ্যাডাপটিভ টেস্ট', 'দুর্বলতা অনুযায়ী ২০ প্রশ্ন', () => start('/tests/adaptive', { count: 20 }, 'ad')],
    ['🏛️', 'পূর্ণাঙ্গ মডেল টেস্ট', 'আসল পরীক্ষার প্যাটার্ন', () => start('/tests/mock', {}, 'mk')],
    ['⏱️', 'মিনি মডেল টেস্ট', '২৫ প্রশ্ন', () => start('/tests/mock', { count: 25 }, 'mm')],
    ['🔥', 'কঠিন চ্যালেঞ্জ', 'শক্তিশালী টপিকে কঠিন প্রশ্ন', () => start('/tests/adaptive', { count: 20, focus: 'hard' }, 'hd')],
  ];

  return (
    <Screen>
      <ErrorBox error={error} />
      <Row>
        {quick.map(([i, t, d, fn]) => (
          <Pressable key={t} onPress={fn} disabled={!!busy} style={{ width: '48%', flexGrow: 1 }}>
            <Card><T style={{ fontSize: 24 }}>{i}</T><T bold>{t}</T><T small muted>{d}</T></Card>
          </Pressable>
        ))}
      </Row>
      <Card>
        <H3>📚 বিষয় ও টপিক</H3>
        {loading && !subjects ? <Loader /> : subjects?.map((s) => (
          <View key={s.id} style={{ borderBottomWidth: 1, borderColor: C.line, paddingVertical: 8 }}>
            <Pressable onPress={() => toggle(s)}><Row between><T bold style={{ flex: 1 }}>{s.name_bn}</T><T small muted>{bn(s.question_count)} প্রশ্ন {open === s.id ? '▾' : '▸'}</T></Row></Pressable>
            {open === s.id && (
              <View style={{ gap: 8, marginTop: 8 }}>
                <Row>{(topics[s.id] || []).map((t) => (
                  <Chip key={t.id} label={`${t.name_bn} (${bn(t.question_count)})`} active={picked.includes(t.id)}
                    onPress={() => setPicked((p) => (p.includes(t.id) ? p.filter((x) => x !== t.id) : [...p, t.id]))} />
                ))}</Row>
                <Btn title={`পুরো বিষয় থেকে ${bn(count)}টি`} kind="ghost" small busy={busy === `s${s.id}`} onPress={() => start('/tests/practice', { subjectId: s.id, count, timed }, `s${s.id}`)} />
              </View>
            )}
          </View>
        ))}
        <Row style={{ marginTop: 8 }}>
          {[10, 20, 30].map((n) => <Chip key={n} label={`${bn(n)} প্রশ্ন`} active={count === n} onPress={() => setCount(n)} />)}
        </Row>
        <Row>
          <Chip label="প্র্যাকটিস মোড (সাথে সাথে উত্তর)" active={!timed} onPress={() => setTimed(false)} />
          <Chip label="পরীক্ষা মোড" active={timed} onPress={() => setTimed(true)} />
        </Row>
        <Btn title={`নির্বাচিত ${bn(picked.length)}টি টপিকে শুরু`} disabled={!picked.length} busy={busy === 'pk'} onPress={() => start('/tests/practice', { topicIds: picked, count, timed }, 'pk')} />
      </Card>
    </Screen>
  );
}
