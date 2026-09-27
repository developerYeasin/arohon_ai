import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { api } from './api';

export const C = {
  navy: '#0f1535', brand: '#4f46e5', brandSoft: '#eef0ff', accent: '#f97316', accentSoft: '#fff1e6',
  bg: '#f5f6fb', card: '#ffffff', text: '#1c2140', muted: '#6b7090', line: '#e6e8f2',
  good: '#16a34a', goodSoft: '#e9f8ef', mid: '#d97706', midSoft: '#fff6e5', bad: '#dc2626', badSoft: '#fdecec',
};

const BN = '০১২৩৪৫৬৭৮৯';
export const bn = (v) => (v == null ? '—' : String(v).replace(/\d/g, (d) => BN[d]));
export const tone = (v) => (v == null ? C.muted : v >= 70 ? C.good : v >= 45 ? C.mid : C.bad);
export const fmtDuration = (sec) => {
  if (sec == null) return '—';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60, p = (n) => String(n).padStart(2, '0');
  return bn(h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`);
};
export const fmtDate = (d, time) => (d ? new Date(d).toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short', ...(time ? { hour: 'numeric', minute: '2-digit' } : {}) }) : '—');
export const BN_LETTER = { a: 'ক', b: 'খ', c: 'গ', d: 'ঘ' };

// Refetches whenever the screen regains focus, so data is fresh after an exam.
export function useFetch(path, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const depKey = JSON.stringify(deps);
  const load = useCallback(async () => {
    if (!path) { setLoading(false); return; }
    setLoading(true); setError(null);
    try { setData(await api.get(path)); } catch (e) { setError(e); } finally { setLoading(false); }
  }, [path, depKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return { data, error, loading, reload: load, setData };
}

// Create a test on the server, then open the exam screen.
export function useStartTest() {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const start = async (endpoint, body = {}, key = endpoint) => {
    setBusy(key); setError(null);
    try { const d = await api.post(endpoint, body); router.push(`/exam/${d.test_id}`); } catch (e) { setError(e); } finally { setBusy(null); }
  };
  return { start, busy, error };
}

export function Screen({ children, onRefresh, refreshing = false, scroll = true, style }) {
  const body = scroll
    ? <ScrollView contentContainerStyle={[s.page, style]} refreshControl={onRefresh && Platform.OS !== 'web' ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined} keyboardShouldPersistTaps="handled">{children}</ScrollView>
    : <View style={[s.page, { flex: 1 }, style]}>{children}</View>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['left', 'right']}>{body}</SafeAreaView>;
}

export const Card = ({ children, style, dark }) => <View style={[s.card, dark && s.cardDark, style]}>{children}</View>;
export const H1 = ({ children, style }) => <Text style={[s.h1, style]}>{children}</Text>;
export const H3 = ({ children, style, light }) => <Text style={[s.h3, light && { color: '#fff' }, style]}>{children}</Text>;
export const T = ({ children, style, muted, small, bold, light, center }) => (
  <Text style={[s.t, muted && { color: light ? '#b7bce6' : C.muted }, small && { fontSize: 13 }, bold && { fontWeight: '700' }, light && !muted && { color: '#fff' }, center && { textAlign: 'center' }, style]}>{children}</Text>
);
export const Row = ({ children, style, between }) => <View style={[s.row, between && { justifyContent: 'space-between' }, style]}>{children}</View>;

export function Btn({ title, onPress, kind = 'primary', small, disabled, busy, style }) {
  const bg = { primary: C.brand, accent: C.accent, danger: C.bad, light: '#fff', ghost: 'transparent' }[kind];
  const fg = kind === 'light' || kind === 'ghost' ? C.brand : '#fff';
  return (
    <Pressable onPress={onPress} disabled={disabled || busy} accessibilityRole="button"
      style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }, (kind === 'light' || kind === 'ghost') && { borderWidth: 1, borderColor: kind === 'ghost' ? '#cfd3f7' : C.line }, small && s.btnSmall, style]}>
      {busy ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontWeight: '700', fontSize: small ? 13 : 15 }}>{title}</Text>}
    </Pressable>
  );
}

export const Input = (props) => <TextInput placeholderTextColor="#9aa0b8" {...props} style={[s.input, props.multiline && { minHeight: 110, textAlignVertical: 'top' }, props.style]} />;

export function Bar({ value, color }) {
  return <View style={s.bar}><View style={{ width: `${Math.max(0, Math.min(100, value || 0))}%`, height: '100%', borderRadius: 99, backgroundColor: color || tone(value) }} /></View>;
}

export function Badge({ children, color = C.brand, bg = C.brandSoft }) {
  return <View style={[s.badge, { backgroundColor: bg }]}><Text style={{ color, fontSize: 12, fontWeight: '700' }}>{children}</Text></View>;
}

export const Loader = () => <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator size="large" color={C.brand} /></View>;

export function ErrorBox({ error }) {
  if (!error) return null;
  const msg = typeof error === 'string' ? error : error.message;
  if (error?.code === 'upgrade_required') {
    return (
      <View style={[s.alert, { backgroundColor: C.midSoft }]}>
        <T style={{ color: '#92400e' }}>🔒 {msg}</T>
        <Btn title="এক্সাম পাস নিন" kind="accent" small style={{ marginTop: 8, alignSelf: 'flex-start' }} onPress={() => router.push('/billing')} />
      </View>
    );
  }
  return <View style={[s.alert, { backgroundColor: C.badSoft }]}><T style={{ color: '#991b1b' }}>{msg}</T></View>;
}

export function Empty({ icon = '📭', title, children }) {
  return <View style={{ alignItems: 'center', padding: 24 }}><Text style={{ fontSize: 36 }}>{icon}</Text><T bold center>{title}</T>{children ? <T muted small center style={{ marginTop: 6 }}>{children}</T> : null}</View>;
}

export function Locked({ title }) {
  return (
    <Pressable onPress={() => router.push('/billing')} style={s.locked}>
      <T bold center>🔒 {title}</T>
      <T small center style={{ color: C.accent, marginTop: 4 }}>এক্সাম পাস দিয়ে আনলক করুন →</T>
    </Pressable>
  );
}

export function Chip({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && { backgroundColor: C.brand, borderColor: C.brand }]}>
      <Text style={{ color: active ? '#fff' : C.text, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function useTicker(ms = 1000) {
  const [, setN] = useState(0);
  useEffect(() => { const t = setInterval(() => setN((n) => n + 1), ms); return () => clearInterval(t); }, [ms]);
}

export const s = StyleSheet.create({
  page: { padding: 16, paddingBottom: 40, gap: 14 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.line, gap: 8 },
  cardDark: { backgroundColor: C.navy, borderColor: C.navy },
  h1: { fontSize: 22, fontWeight: '700', color: C.text },
  h3: { fontSize: 16, fontWeight: '700', color: C.text },
  t: { fontSize: 15, color: C.text, lineHeight: 22 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  btn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 9 },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 16, backgroundColor: '#fff', color: C.text },
  bar: { height: 8, backgroundColor: '#eceef6', borderRadius: 99, overflow: 'hidden', flex: 1 },
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99, alignSelf: 'flex-start' },
  alert: { padding: 12, borderRadius: 12 },
  locked: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#f5c38a', backgroundColor: '#fffaf3', borderRadius: 12, padding: 14 },
  chip: { borderWidth: 1, borderColor: C.line, backgroundColor: '#fff', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: C.line, borderRadius: 12, padding: 12, backgroundColor: '#fff' },
  bubble: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: '#b9bedf', alignItems: 'center', justifyContent: 'center' },
});

// Alert with buttons is a no-op on web; fall back to window.confirm there.
export function confirm(title, message, okText, onOk, cancelText = 'ফিরে যান') {
  if (Platform.OS === 'web') { if (window.confirm(`${title}

${message}`)) onOk(); return; }
  Alert.alert(title, message, [{ text: cancelText, style: 'cancel' }, { text: okText, onPress: onOk }]);
}
