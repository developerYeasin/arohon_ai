import { View } from 'react-native';
import { Bar, Btn, C, Card, ErrorBox, H3, Loader, Locked, Row, Screen, T, bn, fmtDate, useFetch, useStartTest } from '../lib/ui';

const ICON = { revision: '🔁', subject: '📚', mock: '🏛️', current_affairs: '📰', rest: '😴', exam: '🎯' };

export default function Planner() {
  const { data, error, loading, reload } = useFetch('/analytics/planner');
  const { start, busy, error: startErr } = useStartTest();
  if (loading && !data) return <Loader />;
  if (error) return <Screen><ErrorBox error={error} /></Screen>;
  const run = (it, key) => ({
    subject: () => start('/tests/adaptive', { subjectIds: [it.subject_id], count: 20, focus: 'weak' }, key),
    mock: () => start('/tests/mock', { count: 25 }, key),
    revision: () => start('/tests/revision', {}, key),
    current_affairs: () => start('/tests/current-affairs', { count: 5 }, key),
  }[it.type]?.());
  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <T muted small>{data.label} · {data.exam.name} · দৈনিক {bn(data.daily_minutes)} মিনিট{data.days_left != null ? ` · বাকি ${bn(data.days_left)} দিন` : ''}</T>
      <ErrorBox error={startErr} />
      <Card>
        <Row between><H3>📅 সাপ্তাহিক লক্ষ্য</H3><T bold>{bn(data.progress.percent)}%</T></Row>
        <T small muted>{bn(data.progress.done)} / {bn(data.progress.goal)} প্রশ্ন</T>
        <Bar value={data.progress.percent} color={C.brand} />
      </Card>
      {data.week.map((d, i) => (
        <Card key={d.date} style={i === 0 ? { borderColor: C.brand, borderWidth: 2 } : null}>
          <Row between><T bold>{i === 0 ? 'আজ' : d.weekday}</T><T small muted>{fmtDate(d.date)}</T></Row>
          {d.note && <T small style={{ color: C.mid }}>{d.note}</T>}
          {d.items.map((it, k) => (
            <Row key={k} between style={{ flexWrap: 'nowrap' }}>
              <View style={{ flex: 1 }}><T small>{ICON[it.type]} {it.title}</T>{it.minutes > 0 && <T small muted>~{bn(it.minutes)} মিনিট</T>}</View>
              {i === 0 && ['subject', 'mock', 'revision', 'current_affairs'].includes(it.type) && <Btn title="শুরু" kind="ghost" small busy={busy === `${k}`} onPress={() => run(it, `${k}`)} />}
            </Row>
          ))}
        </Card>
      ))}
      <Card>
        <H3>🧭 পর্যায়ভিত্তিক পরিকল্পনা</H3>
        {data.phases_locked ? <Locked title="পরীক্ষা পর্যন্ত পর্যায়ভিত্তিক পরিকল্পনা" /> : data.phases.map((p) => (
          <View key={p.name} style={{ backgroundColor: p.current ? C.brandSoft : '#f7f8fc', borderRadius: 10, padding: 10 }}>
            <T bold>{p.name}{p.current ? ' — এখন' : ''}</T><T small muted>{fmtDate(p.from)} – {fmtDate(p.to)} · {bn(p.days)} দিন</T><T small>{p.desc}</T>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
