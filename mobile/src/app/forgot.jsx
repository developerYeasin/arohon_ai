import { useState } from 'react';
import { api, tokenStore } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Btn, C, Card, ErrorBox, Input, Screen, T } from '../lib/ui';

const norm = (v) => v.trim().replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d));

export default function Forgot() {
  const { refresh } = useAuth();
  const [step, setStep] = useState(1);
  const [login, setLogin] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const request = async () => {
    setBusy(true); setErr(null);
    try { const d = await api.post('/auth/forgot', { login: norm(login) }); setInfo(d.dev_code ? `${d.message} (ডেভ কোড: ${d.dev_code})` : d.message); setStep(2); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const reset = async () => {
    setBusy(true); setErr(null);
    try { const d = await api.post('/auth/reset', { login: norm(login), code: norm(code), password: pw }); await tokenStore.set(d.token); await refresh(); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <Screen>
      <Card>
        <ErrorBox error={err} />
        {step === 1 ? <>
          <T muted small>অ্যাকাউন্টের ইমেইল বা মোবাইল দিন — ৬ অঙ্কের কোড পাঠানো হবে।</T>
          <Input value={login} onChangeText={setLogin} autoCapitalize="none" placeholder="ইমেইল অথবা মোবাইল" />
          <Btn title="কোড পাঠান" onPress={request} busy={busy} disabled={!login} />
        </> : <>
          {info && <T small style={{ color: C.good }}>{info}</T>}
          <Input value={code} onChangeText={setCode} keyboardType="number-pad" placeholder="৬ অঙ্কের কোড" />
          <Input value={pw} onChangeText={setPw} secureTextEntry placeholder="নতুন পাসওয়ার্ড" />
          <Btn title="পাসওয়ার্ড বদলান ও লগইন" onPress={reset} busy={busy} disabled={!code || pw.length < 6} />
          <Btn title="আবার কোড পাঠান" kind="ghost" small onPress={request} />
        </>}
      </Card>
    </Screen>
  );
}
