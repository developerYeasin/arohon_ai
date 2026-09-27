import { View } from 'react-native';
import { Bar, Btn, C, Card, Empty, ErrorBox, H3, Loader, Locked, Row, Screen, T, bn, useFetch, useStartTest } from '../lib/ui';

export default function Mistakes() {
  const { data, error, loading, reload } = useFetch('/analytics/mistakes');
  const { start, busy, error: startErr } = useStartTest();
  if (loading && !data) return <Loader />;
  if (error) return <Screen><ErrorBox error={error} /></Screen>;
  const r = data.review;
  const max = Math.max(1, ...data.by_type.map((t) => t.count));
  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <ErrorBox error={startErr} />
      <Card dark>
        <H3 light>🔁 স্মার্ট রিভিশন</H3>
        <T light muted small>{r.due_today ? `আজ ${bn(r.due_today)}টি প্রশ্ন রিভিশন দিলে সবচেয়ে বেশি লাভ।` : 'আজকের রিভিশন শেষ!'}</T>
        <Row>{[['আজ', r.due_today], ['কাল', r.due_tomorrow], ['এই সপ্তাহ', r.due_week], ['আয়ত্তে', r.mastered]].map(([l, v]) => (
          <View key={l} style={{ flex: 1, minWidth: 70, backgroundColor: 'rgba(255,255,255,.08)', borderRadius: 10, padding: 8 }}><T light bold>{bn(v)}</T><T light muted small>{l}</T></View>
        ))}</Row>
        <Btn title="আজকের রিভিশন শুরু" kind="accent" disabled={!r.due_today} busy={busy === 'rev'} onPress={() => start('/tests/revision', {}, 'rev')} />
      </Card>
      {data.total === 0 ? <Card><Empty icon="🎉" title="এখনো কোনো ভুল রেকর্ড নেই" /></Card> : <>
        <Card>
          <H3>🧠 ভুলের ধরন ({bn(data.total)}টি)</H3>
          {data.by_type.map((t) => (
            <View key={t.type} style={{ gap: 4, paddingVertical: 6, borderBottomWidth: 1, borderColor: C.line }}>
              <Row between><T small bold>{t.label}</T><T small>{bn(t.count)}</T></Row>
              <Bar value={(t.count / max) * 100} color={C.bad} />
              <T small muted>{t.remedy}</T>
              <Btn title="রি-টেস্ট" kind="ghost" small style={{ alignSelf: 'flex-start' }} busy={busy === t.type} onPress={() => start('/tests/mistakes', { type: t.type, count: 15 }, t.type)} />
            </View>
          ))}
        </Card>
        <Card>
          <H3>📍 যে টপিকে বেশি ভুল</H3>
          {!data.pro ? <Locked title="টপিকভিত্তিক ভুল বিশ্লেষণ" /> : data.by_topic.map((t) => (
            <Row key={t.topic_id} between>
              <T small style={{ flex: 1 }}><T small bold>{t.topic}</T> · {bn(t.count)} ভুল · {t.main_label}</T>
              <Btn title="অনুশীলন" kind="light" small onPress={() => start('/tests/adaptive', { topicIds: [t.topic_id], count: 15, focus: 'weak' }, `t${t.topic_id}`)} />
            </Row>
          ))}
        </Card>
      </>}
    </Screen>
  );
}
