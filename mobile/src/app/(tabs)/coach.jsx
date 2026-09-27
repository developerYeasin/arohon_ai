import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '../../lib/api';
import { Btn, C, Chip, ErrorBox, Input, Row, T, useFetch, useStartTest } from '../../lib/ui';

const PROMPTS = ['আজ কী পড়ব?', 'আমি কেন নম্বর হারাচ্ছি?', 'আমি কি উন্নতি করছি?', 'আমার দুর্বল জায়গা কোথায়?', '৩০ দিন বাকি, কী করব?', '১০ দিন বাকি, কী বাদ দেব?', 'বারবার ভুল প্রশ্নে টেস্ট নাও'];

export default function Coach() {
  const { data: history } = useFetch('/coach/history');
  // Saved history plus this session's messages (derived, not copied into state).
  // Session messages are tied to the history snapshot they followed; a reload (which includes them) drops them.
  const [live, setLive] = useState({ base: null, items: [] });
  const base = history ? history.length : null;
  const add = (m) => setLive((l) => ({ base, items: [...(l.base === base ? l.items : []), m] }));
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState(null);
  const { start, busy, error: startErr } = useStartTest();
  const scroll = useRef(null);
  const msgs = [...(history || []).map((h) => ({ role: h.role, content: h.content })), ...(live.base === base ? live.items : [])];

  const send = async (m = text) => {
    m = m.trim(); if (!m || sending) return;
    setText(''); setErr(null); setSending(true);
    add({ role: 'user', content: m });
    try { const d = await api.post('/coach', { message: m }); add({ role: 'assistant', content: d.text, actions: d.actions }); }
    catch (e) { setErr(e); } finally { setSending(false); }
  };
  const run = (a) => {
    const map = {
      adaptive: () => start('/tests/adaptive', { topicIds: a.topicIds || [], count: a.count || 20, focus: a.focus || 'weak' }, a.label),
      mistakes_test: () => start('/tests/mistakes', { count: a.count || 20 }, a.label),
      revision: () => start('/tests/revision', {}, a.label),
      session: () => start('/tests/session', { minutes: a.minutes }, a.label),
      mock: () => start('/tests/mock', {}, a.label),
      mistakes: () => router.push('/mistakes'),
      analytics: () => router.push('/analytics'),
    };
    (map[a.type] || (() => router.push('/')))();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 14, gap: 10 }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
        {!msgs.length && <Bubble role="assistant" content="আমি আপনার প্রস্তুতি কোচ। আপনার রেডিনেস, দুর্বল টপিক ও ভুলের ধরন দেখে পরামর্শ দেব। নিচের যেকোনো প্রশ্ন দিয়ে শুরু করুন।" />}
        {msgs.map((m, i) => (
          <Bubble key={i} {...m}>
            {m.actions?.length > 0 && <Row style={{ marginTop: 8 }}>{m.actions.map((a) => <Btn key={a.label} title={a.label} small busy={busy === a.label} onPress={() => run(a)} />)}</Row>}
          </Bubble>
        ))}
        {sending && <T muted small>ভাবছি…</T>}
        <ErrorBox error={err || startErr} />
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 10, paddingVertical: 6 }} style={{ flexGrow: 0 }}>
        {PROMPTS.map((p) => <Chip key={p} label={p} onPress={() => send(p)} />)}
      </ScrollView>
      <Row style={{ padding: 10, flexWrap: 'nowrap', backgroundColor: '#fff', borderTopWidth: 1, borderColor: C.line }}>
        <Input style={{ flex: 1 }} value={text} onChangeText={setText} placeholder="যেমন: আমার হাতে ৪০ মিনিট আছে" onSubmitEditing={() => send()} />
        <Btn title="পাঠান" onPress={() => send()} disabled={!text.trim() || sending} />
      </Row>
    </KeyboardAvoidingView>
  );
}

function Bubble({ role, content, children }) {
  const me = role === 'user';
  return (
    <View style={{ alignSelf: me ? 'flex-end' : 'flex-start', maxWidth: '88%', backgroundColor: me ? C.brand : '#fff', borderRadius: 14, padding: 12, borderWidth: me ? 0 : 1, borderColor: C.line }}>
      <T style={{ color: me ? '#fff' : C.text }}>{content}</T>
      {children}
    </View>
  );
}
