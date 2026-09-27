import { Badge, Btn, C, Card, ErrorBox, H3, Loader, Screen, T, bn, fmtDate, useFetch, useStartTest } from '../lib/ui';

export default function CurrentAffairs() {
  const { data, error, loading, reload } = useFetch('/current-affairs');
  const { start, busy, error: startErr } = useStartTest();
  if (loading && !data) return <Loader />;
  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <ErrorBox error={error || startErr} />
      <Btn title="২০ প্রশ্নের সাপ্তাহিক টেস্ট" busy={busy === 'all'} onPress={() => start('/tests/current-affairs', { count: 20 }, 'all')} />
      {data?.map((c) => (
        <Card key={c.id}>
          <Badge color="#c2410c" bg={C.accentSoft}>{c.category} · {fmtDate(c.published_on)}</Badge>
          <H3>{c.title}</H3>
          <T small>{c.summary}</T>
          {c.key_facts?.map((k) => <T key={k} small>• {k}</T>)}
          {c.questions > 0 && <Btn title={`${bn(c.questions)}টি প্রশ্নে যাচাই করুন`} kind="ghost" small style={{ alignSelf: 'flex-start' }} busy={busy === c.id} onPress={() => start('/tests/current-affairs', { currentAffairId: c.id, count: 5 }, c.id)} />}
        </Card>
      ))}
    </Screen>
  );
}
