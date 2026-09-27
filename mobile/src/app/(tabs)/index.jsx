import { View } from 'react-native';
import { router } from 'expo-router';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Badge, Bar, Btn, C, Card, Chip, ErrorBox, H1, H3, Loader, Locked, Row, Screen, T, bn, tone, useFetch, useStartTest } from '../../lib/ui';

export default function Home() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useFetch('/analytics/dashboard');
  const { start, busy, error: startErr } = useStartTest();
  if (loading && !data) return <Loader />;
  if (error) return <Screen><ErrorBox error={error} /></Screen>;
  const r = data.readiness;
  const items = data.mission.items;
  const done = items.filter((i) => i.done).length;
  const a = data.access;

  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <Row between>
        <View style={{ flex: 1 }}><H1>স্বাগতম, {user?.name.split(' ')[0]} 👋</H1>
          <T muted small>{r?.exam.name}{data.days_left != null ? ` · পরীক্ষার বাকি ${bn(data.days_left)} দিন` : ''}</T></View>
        <Badge color="#c2410c" bg={C.accentSoft}>🔥 {bn(data.user.streak)}</Badge>
      </Row>
      {a?.tier === 'trial' && <Badge color={C.good} bg={C.goodSoft}>🎁 ফ্রি ট্রায়াল চলছে — সব ফিচার খোলা</Badge>}
      {a?.tier === 'free' && <Btn title="⭐ এক্সাম পাস নিন" kind="accent" small style={{ alignSelf: 'flex-start' }} onPress={() => router.push('/billing')} />}
      <ErrorBox error={startErr} />

      {data.new_badges?.length > 0 && (
        <Card style={{ backgroundColor: C.goodSoft, borderColor: C.goodSoft }}>
          <T>🏅 নতুন অর্জন: {data.new_badges.map((b) => `${b.icon} ${b.bn}`).join(' · ')}</T>
          <Btn title="ঠিক আছে" kind="light" small style={{ alignSelf: 'flex-start' }} onPress={async () => { await api.post('/analytics/badges/seen'); reload(); }} />
        </Card>
      )}

      {(!r || r.answers_used < 20) && (
        <Card style={{ borderColor: C.accent, borderWidth: 2 }}>
          <H3>🧭 প্রথম ধাপ: ২০ প্রশ্নের ডায়াগনস্টিক টেস্ট</H3>
          <T muted small>এখান থেকেই তৈরি হবে আপনার রেডিনেস স্কোর, দুর্বল টপিক ও ব্যক্তিগত পরিকল্পনা।</T>
          <Btn title="শুরু করুন" kind="accent" busy={busy === 'diag'} onPress={() => start('/tests/adaptive', { count: 20 }, 'diag')} />
        </Card>
      )}

      <Card dark>
        <Row between>
          <View>
            <T light muted small>{r?.exam.name} — রেডিনেস</T>
            <T light style={{ fontSize: 40, fontWeight: '700', lineHeight: 48, color: tone(r?.overall) === C.muted ? '#fff' : tone(r?.overall) }}>{bn(r?.overall ?? 0)}%</T>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <T light muted small>আনুমানিক নম্বর</T>
            <T light bold style={{ fontSize: 20 }}>{r?.projected_marks == null ? '🔒' : `${bn(r.projected_marks)} / ${bn(r.exam.total_questions)}`}</T>
          </View>
        </Row>
        {r?.biggest_risk && <T small style={{ color: '#fcd34d' }}>⚠ {r.biggest_risk.text}</T>}
        {r?.recommended_action && <T small style={{ color: '#c7d2fe' }}>→ {r.recommended_action.text}</T>}
        <Row>
          {r?.recommended_action?.type === 'topic' && <Btn title="রিকভারি শুরু" kind="accent" small busy={busy === 'rec'} onPress={() => start('/tests/adaptive', { topicIds: [r.recommended_action.topicId], count: 20, focus: 'weak' }, 'rec')} />}
          <Btn title="বিস্তারিত" kind="light" small onPress={() => router.push('/analytics')} />
        </Row>
      </Card>

      <Card>
        <Row between><H3>🎯 আজকের মিশন</H3><Badge>{bn(items.reduce((s, i) => s + i.minutes, 0))} মিনিট</Badge></Row>
        <Bar value={items.length ? (done / items.length) * 100 : 0} color={C.good} />
        {done === items.length && items.length > 0 && <T small style={{ color: C.good }}>✅ আজকের লক্ষ্য সম্পন্ন — দারুণ! চাইলে বিশ্রাম নিন।</T>}
        {items.map((it) => (
          <Row key={it.key} between style={{ paddingVertical: 6, borderBottomWidth: 1, borderColor: C.line, flexWrap: 'nowrap' }}>
            <View style={{ flex: 1 }}>
              <T small bold style={it.done ? { textDecorationLine: 'line-through', color: C.muted } : null}>{it.done ? '✓ ' : ''}{it.title}</T>
              <T small muted>~{bn(it.minutes)} মিনিট</T>
            </View>
            {it.done ? (it.attempt_id ? <Btn title="ফল" kind="light" small onPress={() => router.push(`/result/${it.attempt_id}`)} /> : null)
              : <Btn title="শুরু" small busy={busy === it.key} onPress={() => start(`/tests/mission/${it.key}`, {}, it.key)} />}
          </Row>
        ))}
      </Card>

      <Card>
        <H3>⏱️ হাতে কত সময় আছে?</H3>
        <Row>{[15, 30, 45, 60].map((m) => <Chip key={m} label={`${bn(m)} মিনিট`} onPress={() => start('/tests/session', { minutes: m }, `s${m}`)} />)}</Row>
      </Card>

      <Row>
        <Card style={{ flex: 1, minWidth: 140 }}><T bold style={{ fontSize: 22 }}>{bn(data.due_reviews)}</T><T small muted>আজ রিভিশন</T>
          {data.due_reviews > 0 && <Btn title="শুরু" small kind="ghost" onPress={() => start('/tests/revision', {}, 'rev')} />}</Card>
        <Card style={{ flex: 1, minWidth: 140 }}><T bold style={{ fontSize: 22 }}>{bn(data.week_goal?.done ?? 0)}/{bn(data.week_goal?.goal ?? 0)}</T><T small muted>সাপ্তাহিক লক্ষ্য</T><Bar value={data.week_goal?.percent} color={C.brand} /></Card>
      </Row>

      <Card>
        <H3>📚 বিষয়ভিত্তিক প্রস্তুতি</H3>
        {r?.subjects.map((s) => (
          <Row key={s.id} style={{ flexWrap: 'nowrap' }}>
            <T small style={{ flex: 1.3 }}>{s.name}</T>
            <Bar value={s.readiness} />
            <T small style={{ width: 40, textAlign: 'right' }}>{s.attempts ? `${bn(s.readiness)}%` : '—'}</T>
          </Row>
        ))}
      </Card>

      <Card>
        <H3>🩹 নির্দিষ্ট দুর্বলতা</H3>
        {r?.weak_topics.length ? r.weak_topics.map((t) => (
          <Row key={t.id} between>
            <T small style={{ flex: 1 }}><T small bold>{t.name}</T> · {bn(t.accuracy)}%</T>
            <Btn title="অনুশীলন" kind="ghost" small onPress={() => start('/tests/adaptive', { topicIds: [t.id], count: 15, focus: 'weak' }, `t${t.id}`)} />
          </Row>
        )) : <T small muted>কমপক্ষে ৩টি উত্তর দেওয়া টপিক থেকে দুর্বলতা শনাক্ত হয়।</T>}
        {r?.hidden_weak_topics > 0 && <Locked title={`আরও ${bn(r.hidden_weak_topics)}টি দুর্বল টপিক`} />}
      </Card>

      {data.live.length > 0 && (
        <Card>
          <H3>🔴 লাইভ এক্সাম</H3>
          {data.live.map((l) => (
            <Row key={l.id} between>
              <T small style={{ flex: 1 }}>{l.title}</T>
              {new Date(l.starts_at) <= new Date() ? <Btn title="অংশ নিন" kind="danger" small onPress={() => router.push(`/exam/${l.id}`)} /> : <Badge>আসন্ন</Badge>}
            </Row>
          ))}
        </Card>
      )}
    </Screen>
  );
}
