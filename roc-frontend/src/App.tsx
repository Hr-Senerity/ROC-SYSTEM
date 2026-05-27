import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, createContext, useContext, ReactNode, useEffect } from 'react';
import { LoginPage } from './components/LoginPage';
import { RegisterPage } from './components/RegisterPage';
import { HomePage } from './components/HomePage';
import { ProfilePage } from './components/ProfilePage';
import { ProjectsPage } from './components/ProjectsPage';
import { ProjectDetailPage } from './components/ProjectDetailPage';
import { ProtocolsPage } from './components/ProtocolsPage';
import { SuperAdminPage } from './components/SuperAdminPage';
import { MapDetailPage } from './components/MapDetailPage';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

interface AuthContextType {
  isLoggedIn: boolean;
  token: string | null;
  role: string | null;
  username: string | null;
  login: (username: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  logout: () => void;
  register: (username: string, email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export { API_BASE };

function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('roc_token'));
  const [role, setRole] = useState<string | null>(() => localStorage.getItem('roc_role'));
  const [username, setUsername] = useState<string | null>(() => localStorage.getItem('roc_username'));
  const isLoggedIn = !!token;

  useEffect(() => {
    if (token) {
      localStorage.setItem('roc_token', token);
    } else {
      localStorage.removeItem('roc_token');
    }
  }, [token]);

  useEffect(() => {
    if (role) {
      localStorage.setItem('roc_role', role);
    } else {
      localStorage.removeItem('roc_role');
    }
  }, [role]);

  useEffect(() => {
    if (username) {
      localStorage.setItem('roc_username', username);
    } else {
      localStorage.removeItem('roc_username');
    }
  }, [username]);

  const login = async (user: string, password: string) => {
    try {
      const resp = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password }),
      });
      const data = await resp.json();
      if (data.ok && data.token) {
        setToken(data.token);
        setRole(data.user.role);
        setUsername(data.user.username);
        return { ok: true };
      }
      return { ok: false, message: data.message || 'Login failed' };
    } catch {
      return { ok: false, message: 'Network error — could not reach server' };
    }
  };

  const register = async (user: string, email: string, password: string) => {
    try {
      const resp = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, email, password }),
      });
      const data = await resp.json();
      if (data.ok && data.token) {
        setToken(data.token);
        setRole(data.user.role);
        setUsername(data.user.username);
        return { ok: true };
      }
      return { ok: false, message: data.message || 'Registration failed' };
    } catch {
      return { ok: false, message: 'Network error — could not reach server' };
    }
  };

  const logout = () => {
    setToken(null);
    setRole(null);
    setUsername(null);
    localStorage.removeItem('roc_token');
    localStorage.removeItem('roc_role');
    localStorage.removeItem('roc_username');
  };

  return (
    <AuthContext.Provider value={{ isLoggedIn, token, role, username, login, logout, register }}>
      <Router>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/protocols" element={<ProtocolsPage />} />

          {/* Protected routes */}
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/projects" element={<ProtectedRoute><ProjectsPage /></ProtectedRoute>} />
          <Route path="/project/:projectId" element={<ProtectedRoute><ProjectDetailPage /></ProtectedRoute>} />
          <Route path="/project/:projectId/map/:mapId" element={<ProtectedRoute><MapDetailPage /></ProtectedRoute>} />

          {/* Super admin routes */}
          <Route path="/admin/users" element={<SuperAdminRoute><SuperAdminPage /></SuperAdminRoute>} />

          {/* 404 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthContext.Provider>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isLoggedIn } = useAuth();
  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function SuperAdminRoute({ children }: { children: ReactNode }) {
  const { isLoggedIn, role } = useAuth();
  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }
  if (role !== 'super_admin') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export default App;
