import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../../lib/api';
import { BN_LETTER, Btn, C, Chip, ErrorBox, Loader, Row, T, bn, confirm, fmtDuration, s } from '../../lib/ui';

const CONF = [['sure', 'নিশ্চিত'], ['unsure', 'অনিশ্চিত'], ['guess', 'আন্দাজ']];

export default function Exam() {
  const { id } = useLocalSearchParams();
  const navigation = useNavigation();
  const [sess, setSess] = useState(null);
  const [err, setErr] = useState(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [feedback, setFeedback] = useState({});
  const [remaining, setRemaining] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [grid, setGrid] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const started = useRef(0);
  const qStart = useRef(0);
  const ref = useRef({ answers: {}, submitted: false, submit: null });
  useEffect(() => { ref.current.answers = answers; }, [answers]);
  const key = sess ? `arohon_attempt_${sess.attempt_id}` : null;

  useEffect(() => {
    api.post(`/tests/${id}/start`).then(async (d) => {
      if (d.already_submitted) { router.replace(`/result/${d.attempt_id}`); return; }
      navigation.setOptions({ title: d.test.title });
      started.current = Date.now(); qStart.current = Date.now();
      setSess(d); setRemaining(d.remaining_sec);
      try { const saved = JSON.parse(await AsyncStorage.getItem(`arohon_attempt_${d.attempt_id}`)); if (saved) { setAnswers(saved.answers || {}); setFeedback(saved.feedback || {}); } } catch { /* ignore */ }
    }).catch(setErr);
  }, [id, navigation]);

  useEffect(() => { if (key) AsyncStorage.setItem(key, JSON.stringify({ answers, feedback })).catch(() => {}); }, [key, answers, feedback]);

  const commit = useCallback(() => {
    if (!sess) return;
    const q = sess.questions[idx]; const dt = Date.now() - qStart.current; qStart.current = Date.now();
    setAnswers((a) => ({ ...a, [q.id]: { ...(a[q.id] || {}), time_ms: (a[q.id]?.time_ms || 0) + dt } }));
  }, [sess, idx]);
  const goTo = (i) => { if (!sess || i < 0 || i >= sess.questions.length || i === idx) return; commit(); setIdx(i); setGrid(false); };

  const submit = useCallback(async () => {
    if (!sess || ref.current.submitted) return;
    ref.current.submitted = true; setSubmitting(true);
    const q = sess.questions[idx];
    const final = { ...ref.current.answers };
    final[q.id] = { ...(final[q.id] || {}), time_ms: (final[q.id]?.time_ms || 0) + (Date.now() - qStart.current) };
    try {
      await api.post(`/attempts/${sess.attempt_id}/submit`, { answers: sess.questions.map((x) => ({ question_id: x.id, ...(final[x.id] || {}) })) });
      await AsyncStorage.removeItem(key);
      router.replace(`/result/${sess.attempt_id}`);
    } catch (e) { setErr(e); ref.current.submitted = false; setSubmitting(false); }
  }, [sess, idx, key]);

  const confirmSubmit = useCallback(() => {
    const n = sess ? sess.questions.filter((q) => answers[q.id]?.selected).length : 0;
    confirm('পরীক্ষা জমা দেবেন?', `উত্তর দিয়েছেন ${bn(n)}টি, বাকি ${bn(sess.questions.length - n)}টি।`, 'জমা দিন', submit);
  }, [sess, answers, submit]);

  useEffect(() => {
    if (!sess) return;
    const t = setInterval(() => {
      setElapsed(Math.round((Date.now() - started.current) / 1000));
      setRemaining((r) => {
        if (r == null) return r;
        if (r <= 1) setTimeout(() => ref.current.submit?.(), 0); // time's up → auto-submit
        return Math.max(0, r - 1);
      });
    }, 1000);
    return () => clearInterval(t);
  }, [sess]);
  useEffect(() => { ref.current.submit = submit; }, [submit]);

  // Back button asks before leaving — answers are saved locally either way.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      confirm('পরীক্ষা ছেড়ে যাবেন?', 'আপনার উত্তর সংরক্ষিত থাকবে; পরে চালিয়ে যেতে পারবেন।', 'বের হন', () => router.back(), 'থাকুন');
      return true;
    });
    return () => sub.remove();
  }, []);

  const select = async (q, l) => {
    if (feedback[q.id]) return;
    const at = sess.test.duration_sec ? sess.test.duration_sec - (remaining ?? 0) : elapsed;
    setAnswers((a) => { const p = a[q.id] || {}; return { ...a, [q.id]: { ...p, selected: l, answered_at_sec: at, changed: p.changed || (!!p.selected && p.selected !== l) } }; });
    if (sess.test.instant_feedback) {
      try { const fb = await api.post(`/attempts/${sess.attempt_id}/check`, { question_id: q.id, selected: l }); setFeedback((f) => ({ ...f, [q.id]: fb })); } catch (e) { setErr(e); }
    }
  };

  if (err && !sess) return <View style={{ padding: 16 }}><ErrorBox error={err} /><Btn title="ফিরে যান" kind="light" onPress={() => router.back()} /></View>;
  if (!sess) return <Loader />;
  const { test, questions } = sess;
  const q = questions[idx];
  const a = answers[q.id] || {};
  const fb = feedback[q.id];
  const answered = questions.filter((x) => answers[x.id]?.selected).length;
  const timed = remaining != null;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ backgroundColor: C.navy, paddingHorizontal: 14, paddingVertical: 10 }}>
        <Row between style={{ flexWrap: 'nowrap' }}>
          <T light small muted>{bn(answered)}/{bn(questions.length)} উত্তর · {Number(test.negative_mark) ? `ভুলে −${bn(Number(test.negative_mark))}` : 'নেগেটিভ নেই'}</T>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18, backgroundColor: timed && remaining < 60 ? C.bad : 'rgba(255,255,255,.12)', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 8 }}>
            {timed ? fmtDuration(remaining) : fmtDuration(elapsed)}
          </Text>
        </Row>
      </View>
      <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}>
        <ErrorBox error={err} />
        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, gap: 10, borderWidth: 1, borderColor: C.line }}>
          <T small muted>{bn(idx + 1)}. {q.subject} › {q.topic}</T>
          <T bold style={{ fontSize: 17, lineHeight: 26 }}>{q.body}</T>
          {['a', 'b', 'c', 'd'].map((l) => {
            let bg = '#fff', bc = C.line, bb = '#b9bedf', bf = C.muted;
            if (a.selected === l) { bg = C.brandSoft; bc = C.brand; bb = C.brand; bf = '#fff'; }
            if (fb) {
              if (l === fb.correct) { bg = C.goodSoft; bc = C.good; bb = C.good; bf = '#fff'; }
              else if (a.selected === l) { bg = C.badSoft; bc = C.bad; bb = C.bad; bf = '#fff'; }
            }
            return (
              <Pressable key={l} onPress={() => select(q, l)} style={[s.opt, { backgroundColor: bg, borderColor: bc }]}>
                <View style={[s.bubble, { borderColor: bb, backgroundColor: bf === '#fff' ? bb : 'transparent' }]}><Text style={{ color: bf, fontWeight: '700' }}>{BN_LETTER[l]}</Text></View>
                <T style={{ flex: 1 }}>{q.options[l]}</T>
              </Pressable>
            );
          })}
          {!fb && <Row><T small muted>কতটা নিশ্চিত?</T>{CONF.map(([k, l]) => <Chip key={k} label={l} active={a.confidence === k} onPress={() => setAnswers((x) => ({ ...x, [q.id]: { ...(x[q.id] || {}), confidence: x[q.id]?.confidence === k ? null : k } }))} />)}</Row>}
          {fb && (
            <View style={{ backgroundColor: '#f7f8fc', borderLeftWidth: 4, borderColor: C.brand, borderRadius: 8, padding: 10 }}>
              <T bold style={{ color: fb.is_correct ? C.good : C.bad }}>{fb.is_correct ? '✓ সঠিক!' : `✗ ভুল — সঠিক উত্তর: ${BN_LETTER[fb.correct]}`}</T>
              {fb.explanation && <T small>{fb.explanation}</T>}
            </View>
          )}
        </View>
      </ScrollView>
      <Row between style={{ padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderColor: C.line, flexWrap: 'nowrap' }}>
        <Btn title="←" kind="light" onPress={() => goTo(idx - 1)} disabled={idx === 0} />
        <Btn title={`OMR ${bn(idx + 1)}/${bn(questions.length)}`} kind="light" onPress={() => { commit(); setGrid(true); }} />
        {idx < questions.length - 1 ? <Btn title="পরের →" onPress={() => goTo(idx + 1)} /> : <Btn title="জমা দিন" kind="accent" busy={submitting} onPress={() => { commit(); confirmSubmit(); }} />}
      </Row>
      <Modal visible={grid} animationType="slide" transparent onRequestClose={() => setGrid(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(15,21,53,.5)' }} onPress={() => setGrid(false)} />
        <View style={{ backgroundColor: '#fff', padding: 16, borderTopLeftRadius: 18, borderTopRightRadius: 18, gap: 12, maxHeight: '70%' }}>
          <T bold>OMR শিট — {bn(answered)}টি উত্তর</T>
          <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {questions.map((x, i) => {
              const f = feedback[x.id];
              const bg = f ? (f.is_correct ? C.good : C.bad) : answers[x.id]?.selected ? C.brand : '#fff';
              return (
                <Pressable key={x.id} onPress={() => goTo(i)} style={{ width: 44, height: 44, borderRadius: 10, borderWidth: i === idx ? 2 : 1.5, borderColor: i === idx ? C.navy : C.line, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: bg === '#fff' ? C.text : '#fff', fontWeight: '700' }}>{bn(i + 1)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Btn title="পরীক্ষা জমা দিন" kind="accent" busy={submitting} onPress={() => { setGrid(false); confirmSubmit(); }} />
        </View>
      </Modal>
    </View>
  );
}
