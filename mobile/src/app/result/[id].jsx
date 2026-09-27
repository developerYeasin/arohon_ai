import { useEffect, useMemo, useState } from 'react';
import { Share, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { BN_LETTER, Bar, Btn, C, Card, Chip, ErrorBox, H3, Loader, Locked, Row, Screen, T, bn, fmtDuration, s, useFetch, useStartTest } from '../../lib/ui';

const MISTAKES = { didnt_know: 'জানা ছিল না', forgot: 'ভুলে গেছি', misread: 'ভুল পড়েছি', confused: 'ধারণা গুলিয়েছি', careless: 'অসাবধানতা', time_pressure: 'সময়ের চাপ', guessing: 'আন্দাজ', calculation: 'হিসাবে ভুল', overthinking: 'বেশি ভেবেছি' };

export default function Result() {
  const { id } = useLocalSearchParams();
  const { refresh } = useAuth();
  const { data, error, loading, reload } = useFetch(`/attempts/${id}/report`);
  const { start, busy, error: startErr } = useStartTest();
  const [filter, setFilter] = useState('wrong');
  useEffect(() => { refresh(); }, [refresh]);

  const list = useMemo(() => {
    if (!data) return [];
    return { wrong: data.answers.filter((a) => a.selected && a.is_correct === false), skipped: data.answers.filter((a) => !a.selected), all: data.answers }[filter];
  }, [data, filter]);
  if (loading && !data) return <Loader />;
  if (error) return <Screen><ErrorBox error={error} /></Screen>;
  const { attempt, test, ranking } = data;

  const challenge = async () => {
    const d = await api.post(`/tests/${test.id}/challenge`);
    await Share.share({ message: `আমি "${test.title}" এ পেয়েছি ${attempt.score}/${attempt.total}${ranking.rank ? ` (র‍্যাংক ${ranking.rank}/${ranking.participants})` : ''}। তুমি কি আমাকে হারাতে পারবে? আরোহণে টেস্ট #${d.test_id}` });
  };
  const setMistake = async (qid, type) => { await api.put(`/attempts/${id}/answers/${qid}/mistake`, { type }); reload(); };

  return (
    <Screen>
      <ErrorBox error={startErr} />
      <Card dark>
        <T light muted small>{test.title}</T>
        <Row between>
          <T light style={{ fontSize: 38, fontWeight: '700', lineHeight: 46 }}>{bn(attempt.score)}<Text style={{ fontSize: 18, color: '#b7bce6' }}> / {bn(attempt.total)}</Text></T>
          <View style={{ alignItems: 'flex-end' }}>
            {ranking.rank && <T light bold>র‍্যাংক {bn(ranking.rank)}/{bn(ranking.participants)}</T>}
            {ranking.percentile != null && <T light muted small>পার্সেন্টাইল {bn(ranking.percentile)}</T>}
          </View>
        </Row>
        <T light small>✓ {bn(attempt.correct)}   ✗ {bn(attempt.wrong)}   — {bn(attempt.skipped)}   ⏱ {fmtDuration(attempt.time_spent_sec)}   +{bn(attempt.xp_earned)} XP</T>
        {!data.results_hidden && <Btn title="⚔️ বন্ধুকে চ্যালেঞ্জ" kind="light" small style={{ alignSelf: 'flex-start' }} onPress={challenge} />}
      </Card>
      {data.results_hidden && <Card style={{ backgroundColor: C.midSoft }}><T small>লাইভ এক্সাম: সঠিক উত্তর সময় শেষ হওয়ার পর দেখানো হবে।</T></Card>}

      <Card>
        <H3>🔍 কেন এই ফলাফল</H3>
        {data.insights.map((i, k) => <T key={k} small style={{ backgroundColor: { good: C.goodSoft, warn: C.midSoft, info: C.brandSoft }[i.tone], padding: 8, borderRadius: 8 }}>{i.text}</T>)}
        {data.hidden_insights > 0 && <Locked title={`আরও ${bn(data.hidden_insights)}টি ইনসাইট`} />}
      </Card>

      {!data.results_hidden && data.mistake_summary.length > 0 && (
        <Card>
          <Row between><H3>🧠 ভুলের ধরন</H3><Btn title="রি-টেস্ট" small busy={busy === 'mt'} onPress={() => start('/tests/mistakes', { count: 20 }, 'mt')} /></Row>
          {data.mistake_summary.map((m) => <View key={m.type}><T small bold>{m.label} — {bn(m.count)}টি</T><T small muted>{m.remedy || '🔒 সমাধান দেখতে এক্সাম পাস নিন'}</T></View>)}
        </Card>
      )}

      <Card>
        <H3>📚 বিষয়ভিত্তিক</H3>
        {data.subjects.map((sub) => (
          <View key={sub.id} style={{ gap: 4 }}>
            <Row between><T small style={{ flex: 1 }}>{sub.name}</T><T small muted>{bn(sub.correct)}/{bn(sub.wrong)}/{bn(sub.skipped)} · {bn(sub.avg_sec)} সে.</T></Row>
            {!data.results_hidden && <Bar value={sub.accuracy} />}
          </View>
        ))}
      </Card>

      <Row>{[['wrong', 'ভুল'], ['skipped', 'বাদ'], ['all', 'সব']].map(([k, l]) => <Chip key={k} label={l} active={filter === k} onPress={() => setFilter(k)} />)}</Row>
      {list.map((a) => (
        <Card key={a.question_id}>
          <T small muted>{bn(a.position)}. {a.subject} › {a.topic} · {bn(a.time_sec)} সে.</T>
          <T bold>{a.body}</T>
          {['a', 'b', 'c', 'd'].map((l) => {
            const good = a.correct === l, bad = a.selected === l && !good && !data.results_hidden;
            return (
              <View key={l} style={[s.opt, good && { borderColor: C.good, backgroundColor: C.goodSoft }, bad && { borderColor: C.bad, backgroundColor: C.badSoft }]}>
                <Text style={{ fontWeight: '700', color: good ? C.good : bad ? C.bad : C.muted }}>{BN_LETTER[l]}</Text><T small style={{ flex: 1 }}>{a.options[l]}</T>
              </View>
            );
          })}
          {a.explanation && <T small style={{ backgroundColor: '#f7f8fc', padding: 8, borderRadius: 8 }}>{a.explanation}</T>}
          {a.selected && a.is_correct === false && (
            <View style={{ gap: 6 }}>
              <T small muted>ভুলের কারণ (স্বয়ংক্রিয় অনুমান বদলাতে পারেন):</T>
              <Row>{Object.entries(MISTAKES).map(([k, l]) => <Chip key={k} label={l} active={a.mistake_type === k} onPress={() => setMistake(a.question_id, k)} />)}</Row>
            </View>
          )}
        </Card>
      ))}
      <Btn title="হোমে ফিরুন" kind="light" onPress={() => router.replace('/')} />
    </Screen>
  );
}
