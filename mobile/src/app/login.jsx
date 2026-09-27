import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '../lib/auth';
import { Btn, C, Card, ErrorBox, Input, T } from '../lib/ui';

const normId = (v) => v.trim().replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d));

export default function Login() {
  const { login } = useAuth();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const submit = async () => {
    setBusy(true); setErr(null);
    try { await login(normId(id), pw); } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.navy }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20, gap: 18 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 48 }}>⛰️</Text>
          <Text style={{ color: '#fff', fontSize: 30, fontWeight: '700' }}>আরোহণ</Text>
          <T light muted center>প্রশ্নব্যাংক নয় — আপনার ব্যক্তিগত পরীক্ষা-প্রস্তুতি সিস্টেম</T>
        </View>
        <Card>
          <ErrorBox error={err} />
          <T bold>ইমেইল অথবা মোবাইল</T>
          <Input value={id} onChangeText={setId} autoCapitalize="none" keyboardType="email-address" autoComplete="username" />
          <T bold>পাসওয়ার্ড</T>
          <Input value={pw} onChangeText={setPw} secureTextEntry autoComplete="password" onSubmitEditing={submit} />
          <Btn title="লগইন" onPress={submit} busy={busy} disabled={!id || !pw} style={{ marginTop: 6 }} />
          <Link href="/forgot" style={{ color: C.brand, textAlign: 'center', marginTop: 6 }}>পাসওয়ার্ড ভুলে গেছেন?</Link>
        </Card>
        <Link href="/register" style={{ color: '#fcd34d', textAlign: 'center', fontWeight: '700' }}>অ্যাকাউন্ট নেই? ফ্রি রেজিস্ট্রেশন করুন</Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
