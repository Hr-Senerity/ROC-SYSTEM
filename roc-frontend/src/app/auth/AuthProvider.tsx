import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiRequest } from '../../shared/api/client';
import { ApiError } from '../../shared/api/errors';

type AuthStatus = 'checking' | 'authenticated' | 'anonymous' | 'error';

interface AuthResponse {
  ok: boolean;
  token: string;
  user: { username: string; role: string };
}

interface SessionResponse {
  ok: boolean;
  user: { username: string; role: string };
}

interface AuthContextType {
  status: AuthStatus;
  isLoggedIn: boolean;
  token: string | null;
  role: string | null;
  username: string | null;
  sessionError: string;
  login: (username: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  logout: () => void;
  register: (username: string, email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  refreshSession: () => Promise<void>;
}

const TOKEN_KEY = 'roc_token';
const ROLE_KEY = 'roc_role';
const USERNAME_KEY = 'roc_username';
const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getStored(key: string): string | null {
  return window.localStorage.getItem(key);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getStored(TOKEN_KEY));
  const [role, setRole] = useState<string | null>(() => getStored(ROLE_KEY));
  const [username, setUsername] = useState<string | null>(() => getStored(USERNAME_KEY));
  const [status, setStatus] = useState<AuthStatus>(() => token ? 'checking' : 'anonymous');
  const [sessionError, setSessionError] = useState('');

  const clearSession = useCallback(() => {
    setToken(null);
    setRole(null);
    setUsername(null);
    setStatus('anonymous');
    setSessionError('');
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(ROLE_KEY);
    window.localStorage.removeItem(USERNAME_KEY);
  }, []);

  const storeSession = useCallback((nextToken: string, nextRole: string, nextUsername: string) => {
    setToken(nextToken);
    setRole(nextRole);
    setUsername(nextUsername);
    setStatus('authenticated');
    setSessionError('');
    window.localStorage.setItem(TOKEN_KEY, nextToken);
    window.localStorage.setItem(ROLE_KEY, nextRole);
    window.localStorage.setItem(USERNAME_KEY, nextUsername);
  }, []);

  const refreshSession = useCallback(async () => {
    if (!token) {
      setStatus('anonymous');
      return;
    }
    setStatus('checking');
    setSessionError('');
    try {
      const data = await apiRequest<SessionResponse>('/api/auth/me', { token });
      storeSession(token, data.user.role, data.user.username);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearSession();
        return;
      }
      setStatus('error');
      setSessionError(error instanceof Error ? error.message : '无法验证登录状态');
    }
  }, [clearSession, storeSession, token]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const login = useCallback(async (user: string, password: string) => {
    try {
      const data = await apiRequest<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: user, password }),
      });
      storeSession(data.token, data.user.role, data.user.username);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '登录失败' };
    }
  }, [storeSession]);

  const register = useCallback(async (user: string, email: string, password: string) => {
    try {
      const data = await apiRequest<AuthResponse>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username: user, email, password }),
      });
      storeSession(data.token, data.user.role, data.user.username);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '注册失败' };
    }
  }, [storeSession]);

  const value = useMemo<AuthContextType>(() => ({
    status,
    isLoggedIn: status === 'authenticated',
    token,
    role,
    username,
    sessionError,
    login,
    logout: clearSession,
    register,
    refreshSession,
  }), [clearSession, login, refreshSession, register, role, sessionError, status, token, username]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
