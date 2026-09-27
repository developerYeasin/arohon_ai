import { router } from 'expo-router';
import { Badge, Btn, C, Card, Empty, ErrorBox, H3, Loader, Row, Screen, T, bn, fmtDate, fmtDuration, useFetch } from '../../lib/ui';

const STATE = { running: ['লাইভ', C.bad, C.badSoft], upcoming: ['আসন্ন', '#c2410c', C.accentSoft], ended: ['সমাপ্ত', C.muted, '#eef0f5'] };

export default function Live() {
  const { data, error, loading, reload } = useFetch('/tests/live');
  if (loading && !data) return <Loader />;
  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <ErrorBox error={error} />
      <T small muted>ন্যায্য প্রতিযোগিতা: প্রতিটি লাইভ এক্সামে একবারই অংশ নেওয়া যায়; সময় শেষের আগে উত্তর প্রকাশ হয় না।</T>
      {!data?.length && <Card><Empty icon="📅" title="কোনো লাইভ এক্সাম নেই" /></Card>}
      {data?.map((t) => {
        const [label, fg, bg] = STATE[t.state];
        return (
          <Card key={t.id}>
            <Badge color={fg} bg={bg}>{label}</Badge>
            <H3>{t.title}</H3>
            <T small muted>{bn(t.questions)} প্রশ্ন · {fmtDuration(t.duration_sec)} · {bn(t.participants)} জন অংশ নিয়েছেন</T>
            <T small muted>{fmtDate(t.starts_at, true)} – {fmtDate(t.ends_at, true)}</T>
            <Row>
              {t.my_status === 'submitted' ? <Btn title="আমার ফলাফল" kind="light" small onPress={() => router.push(`/result/${t.my_attempt_id}`)} />
                : t.state === 'running' && <Btn title={t.my_status === 'in_progress' ? 'চালিয়ে যান' : 'এখনই অংশ নিন'} kind="danger" small onPress={() => router.push(`/exam/${t.id}`)} />}
              {t.state !== 'upcoming' && <Btn title="লিডারবোর্ড" kind="ghost" small onPress={() => router.push(`/leaderboard?test=${t.id}`)} />}
            </Row>
          </Card>
        );
      })}
    </Screen>
  );
}
