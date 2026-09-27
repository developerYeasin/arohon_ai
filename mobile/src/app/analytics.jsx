import { View } from 'react-native';
import { Bar, Btn, Card, ErrorBox, H3, Loader, Locked, Row, Screen, T, bn, tone, useFetch, useStartTest } from '../lib/ui';

const DIMS = [['subject_mastery', 'বিষয়ভিত্তিক দক্ষতা'], ['accuracy', 'নির্ভুলতা'], ['time_management', 'সময় ব্যবস্থাপনা'], ['consistency', 'ধারাবাহিকতা'], ['retention', 'মনে রাখা'], ['simulation', 'পরীক্ষা সিমুলেশন']];

export default function Analytics() {
  const { data: r, error, loading, reload } = useFetch('/analytics/readiness');
  const { data: p } = useFetch('/analytics/progress?days=14');
  const { start, busy } = useStartTest();
  if (loading && !r) return <Loader />;
  if (error) return <Screen><ErrorBox error={error} /></Screen>;
  const maxQ = Math.max(1, ...(p?.daily || []).map((d) => d.questions));
  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <Card dark>
        <T light muted small>{r.exam.name} — সামগ্রিক রেডিনেস</T>
        <T light style={{ fontSize: 42, fontWeight: '700', lineHeight: 50 }}>{bn(r.overall)}%</T>
        <T light small>আনুমানিক নম্বর: {r.projected_marks == null ? '🔒' : `${bn(r.projected_marks)} / ${bn(r.exam.total_questions)}`}</T>
        <T light muted small>{bn(r.answers_used)}টি উত্তরের ভিত্তিতে</T>
      </Card>
      <Card>
        <H3>ছয়টি মাত্রা</H3>
        <Row>{DIMS.map(([k, l]) => (
          <View key={k} style={{ width: '47%', flexGrow: 1, backgroundColor: '#f7f8fc', borderRadius: 10, padding: 10 }}>
            <T bold style={{ fontSize: 20, color: tone(r.dimensions[k]) }}>{r.dimensions[k] == null ? (r.locked ? '🔒' : '—') : `${bn(r.dimensions[k])}%`}</T>
            <T small muted>{l}</T>
          </View>
        ))}</Row>
      </Card>
      {(r.risks.length > 0 || r.hidden_risks > 0) && <Card><H3>⚠️ ঝুঁকি</H3>{r.risks.map((x) => <T key={x.key} small>• {x.text}</T>)}{r.hidden_risks > 0 && <Locked title={`আরও ${bn(r.hidden_risks)}টি ঝুঁকি`} />}</Card>}
      {p?.daily?.length > 0 && (
        <Card>
          <H3>📈 গত ১৪ দিন</H3>
          <Row style={{ alignItems: 'flex-end', height: 90, flexWrap: 'nowrap', gap: 4 }}>
            {p.daily.map((d) => (
              <View key={d.date} style={{ flex: 1, alignItems: 'center' }}>
                <View style={{ width: '80%', height: Math.max(4, (d.questions / maxQ) * 70), backgroundColor: tone(d.accuracy), borderRadius: 4 }} />
                <T small muted style={{ fontSize: 10 }}>{bn(d.date.slice(8))}</T>
              </View>
            ))}
          </Row>
          <T small muted>উচ্চতা = প্রশ্নসংখ্যা, রং = নির্ভুলতা</T>
        </Card>
      )}
      <Card>
        <H3>📚 বিষয়ভিত্তিক</H3>
        {r.subjects.map((s) => (
          <View key={s.id} style={{ gap: 4, paddingVertical: 4 }}>
            <Row between><T small style={{ flex: 1 }}>{s.name} <T small muted>({bn(s.questions)} নম্বর)</T></T><T small>{s.attempts ? `${bn(s.readiness)}%` : '—'}</T></Row>
            <Row style={{ flexWrap: 'nowrap' }}><Bar value={s.readiness} /><Btn title="অনুশীলন" kind="light" small busy={busy === s.id} onPress={() => start('/tests/adaptive', { subjectIds: [s.id], count: 20 }, s.id)} /></Row>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
