import { Pressable } from 'react-native';
import { router } from 'expo-router';
import { C, Card, Empty, ErrorBox, Loader, Row, Screen, T, bn, fmtDate, useFetch } from '../lib/ui';

export default function History() {
  const { data, error, loading, reload } = useFetch('/attempts');
  if (loading && !data) return <Loader />;
  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <ErrorBox error={error} />
      {!data?.length ? <Card><Empty title="এখনো কোনো পরীক্ষা দেননি" /></Card> : data.map((a) => (
        <Pressable key={a.id} onPress={() => router.push(`/result/${a.id}`)}>
          <Card>
            <Row between style={{ flexWrap: 'nowrap' }}>
              <T bold style={{ flex: 1 }}>{a.title}</T>
              <T bold style={{ color: C.brand }}>{bn(Number(a.score))}/{bn(a.total)}</T>
            </Row>
            <T small muted>✓ {bn(a.correct)} ✗ {bn(a.wrong)} — {bn(a.skipped)} · {fmtDate(a.submitted_at, true)}</T>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
