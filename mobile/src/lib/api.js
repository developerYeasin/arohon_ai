import AsyncStorage from '@react-native-async-storage/async-storage';

// Set EXPO_PUBLIC_API_URL in mobile/.env (Android emulator: http://10.0.2.2:5000; real phone: your PC's LAN IP).
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:5000').replace(/\/$/, '');
const KEY = 'arohon_token';

let token = null;
let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export const tokenStore = {
  async load() { token = await AsyncStorage.getItem(KEY); return token; },
  async set(t) { token = t; if (t) await AsyncStorage.setItem(KEY, t); else await AsyncStorage.removeItem(KEY); },
  get: () => token,
};

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error('সার্ভারের সাথে সংযোগ হচ্ছে না — ইন্টারনেট দেখুন'), { status: 0 });
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    if (res.status === 401 && token) { await tokenStore.set(null); onUnauthorized?.(); }
    throw Object.assign(new Error(data?.error || 'কিছু একটা ভুল হয়েছে'), { status: res.status, code: data?.code });
  }
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b = {}) => request('POST', p, b),
  put: (p, b = {}) => request('PUT', p, b),
};
