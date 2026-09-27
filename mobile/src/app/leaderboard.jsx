import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '../lib/auth';
import { C, Card, Chip, Empty, ErrorBox, Loader, Row, Screen, T, bn, fmtDuration, useFetch } from '../lib/ui';

const MEDAL = ['🥇', '🥈', '🥉'];

export default function Leaderboard() {
  const { test } = useLocalSearchParams();
  const { user } = useAuth();
  const [scope, setScope] = useState('national');
  const [period, setPeriod] = useState('week');
  const { data, error, loading } = useFetch(test ? `/tests/${test}/leaderboard` : `/leaderboard?scope=${scope}&period=${period}`, [scope, period, test]);
  return (
    <Screen>
      {!test && <>
        <Row>{[['national', '🇧🇩 জাতীয়'], ['district', '📍 জেলা'], ['institution', '🏫 প্রতিষ্ঠান']].map(([k, l]) => <Chip key={k} label={l} active={scope === k} onPress={() => setScope(k)} />)}</Row>
        <Row>{[['week', 'এই সপ্তাহ'], ['all', 'সর্বকালের']].map(([k, l]) => <Chip key={k} label={l} active={period === k} onPress={() => setPeriod(k)} />)}</Row>
      </>}
      <ErrorBox error={error} />
      {loading && !data ? <Loader /> : !data?.rows?.length ? <Card><Empty title="এখনো কোনো র‍্যাংক নেই" /></Card> : (
        <Card style={{ gap: 0, padding: 0 }}>
          {test && <T bold style={{ padding: 12 }}>{data.test.title}</T>}
          {data.rows.map((r) => {
            const me = (r.user_id || r.id) === user?.id;
            return (
              <Row key={r.attempt_id || r.id} between style={{ padding: 12, borderTopWidth: 1, borderColor: C.line, backgroundColor: me ? C.brandSoft : '#fff', flexWrap: 'nowrap' }}>
                <T style={{ width: 36 }}>{r.rank <= 3 ? MEDAL[r.rank - 1] : bn(r.rank)}</T>
                <T style={{ flex: 1 }} bold={me}>{r.name}<T small muted>{r.district ? ` · ${r.district}` : ''}</T></T>
                <T bold>{test ? `${bn(r.score)} · ${fmtDuration(r.time_spent_sec)}` : `${bn(r.xp)} XP`}</T>
              </Row>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}
