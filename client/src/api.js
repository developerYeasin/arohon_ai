const BASE = (import.meta.env.VITE_API_URL || '') + '/api';

export const tokenStore = {
  get: () => localStorage.getItem('arohon_token'),
  set: (t) => (t ? localStorage.setItem('arohon_token', t) : localStorage.removeItem('arohon_token')),
};

async function request(method, path, body) {
  const token = tokenStore.get();
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    if (res.status === 401 && token) { tokenStore.set(null); window.dispatchEvent(new Event('arohon:logout')); }
    const err = new Error(data?.error || 'নেটওয়ার্ক সমস্যা — আবার চেষ্টা করুন');
    err.status = res.status;
    err.code = data?.code;
    throw err;
  }
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b = {}) => request('POST', p, b),
  put: (p, b = {}) => request('PUT', p, b),
  del: (p) => request('DELETE', p),
};
