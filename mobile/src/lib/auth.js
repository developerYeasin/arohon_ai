import { createContext, useCallback, useContext, useEffect, useState, createElement } from 'react';
import { api, tokenStore, setUnauthorizedHandler } from './api';

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    (async () => {
      if (await tokenStore.load()) {
        try { setUser((await api.get('/auth/me')).user); } catch { await tokenStore.set(null); }
      }
      setReady(true);
    })();
  }, []);

  const finish = async (d) => { await tokenStore.set(d.token); setUser(d.user); return d.user; };
  const login = useCallback(async (login, password) => finish(await api.post('/auth/login', { login, password })), []);
  const register = useCallback(async (payload) => finish(await api.post('/auth/register', payload)), []);
  const logout = useCallback(async () => { await tokenStore.set(null); setUser(null); }, []);
  const refresh = useCallback(async () => { try { setUser((await api.get('/auth/me')).user); } catch { /* offline */ } }, []);
  const updateProfile = useCallback(async (patch) => { const d = await api.put('/auth/me', patch); setUser(d.user); return d.user; }, []);

  return createElement(Ctx.Provider, { value: { user, ready, login, register, logout, refresh, updateProfile } }, children);
}

export const useAuth = () => useContext(Ctx);
