import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, tokenStore } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('arohon:logout', onLogout);
    if (!tokenStore.get()) setReady(true);
    // Only a rejected token logs the user out; a network failure (offline) keeps them signed in.
    else api.get('/auth/me').then((d) => setUser(d.user)).catch((e) => { if (e.status === 401) tokenStore.set(null); }).finally(() => setReady(true));
    return () => window.removeEventListener('arohon:logout', onLogout);
  }, []);

  const login = useCallback(async (loginId, password) => {
    const d = await api.post('/auth/login', { login: loginId, password });
    tokenStore.set(d.token); setUser(d.user); return d.user;
  }, []);
  const register = useCallback(async (payload) => {
    const d = await api.post('/auth/register', payload);
    tokenStore.set(d.token); setUser(d.user); return d.user;
  }, []);
  const logout = useCallback(() => { tokenStore.set(null); setUser(null); }, []);
  const refresh = useCallback(() => api.get('/auth/me').then((d) => setUser(d.user)).catch(() => {}), []);
  const updateProfile = useCallback(async (patch) => {
    const d = await api.put('/auth/me', patch); setUser(d.user); return d.user;
  }, []);

  return <AuthCtx.Provider value={{ user, ready, login, register, logout, updateProfile, refresh }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
