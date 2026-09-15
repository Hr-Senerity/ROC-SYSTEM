import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './app/auth/AuthProvider';
import { VehicleRealtimeProvider } from './app/realtime/VehicleRealtimeProvider';
import { AppShell } from './app/layout/AppShell';
import { ProjectLayout } from './app/layout/ProjectLayout';
import { HomePage } from './components/HomePage';
import { LoginPage } from './components/LoginPage';
import { MapDetailPage } from './components/MapDetailPage';
import { ProfilePage } from './components/ProfilePage';
import { ProjectDetailPage } from './components/ProjectDetailPage';
import { ProjectSettingsPage } from './components/ProjectSettingsPage';
import { ProjectVehiclesPage } from './components/ProjectVehiclesPage';
import { ProjectsPage } from './components/ProjectsPage';
import { ProtocolsPage } from './components/ProtocolsPage';
import { RegisterPage } from './components/RegisterPage';
import { SuperAdminPage } from './components/SuperAdminPage';

function SessionCheck({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
      <div className="max-w-sm rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="font-medium text-slate-900">{message || '正在验证登录状态…'}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 h-9 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
          >
            重试
          </button>
        )}
      </div>
    </main>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status, sessionError, refreshSession } = useAuth();
  const location = useLocation();
  if (status === 'checking') return <SessionCheck />;
  if (status === 'error') {
    return <SessionCheck message={sessionError || '无法验证登录状态'} onRetry={() => void refreshSession()} />;
  }
  if (status !== 'authenticated') {
    return <Navigate to="/login" state={{ from: `${location.pathname}${location.search}` }} replace />;
  }
  return <>{children}</>;
}

function SuperAdminRoute({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  return (
    <ProtectedRoute>
      {role === 'super_admin' ? children : <Navigate to="/forbidden" replace />}
    </ProtectedRoute>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/guide" element={<ProtocolsPage />} />
      <Route path="/projects/:projectId/maps/:mapId/monitor" element={<ProtectedRoute><MapDetailPage /></ProtectedRoute>} />
      <Route path="/project/:projectId/map/:mapId" element={<ProtectedRoute><LegacyMapRedirect /></ProtectedRoute>} />
      <Route path="/project/:projectId" element={<ProtectedRoute><LegacyProjectRedirect /></ProtectedRoute>} />
      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/protocols" element={<ProtocolsPage embedded />} />
        <Route path="/projects/:projectId" element={<ProjectLayout />}>
          <Route index element={<Navigate to="maps" replace />} />
          <Route path="maps" element={<ProjectDetailPage />} />
          <Route path="vehicles" element={<ProjectVehiclesPage />} />
          <Route path="settings" element={<ProjectSettingsPage />} />
        </Route>
        <Route path="/admin/users" element={<SuperAdminRoute><SuperAdminPage /></SuperAdminRoute>} />
      </Route>
      <Route path="/forbidden" element={<main className="p-8"><h1 className="text-2xl font-semibold">无访问权限</h1></main>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function LegacyProjectRedirect() {
  const { projectId } = useParams();
  return <Navigate to={`/projects/${projectId}/maps`} replace />;
}

function LegacyMapRedirect() {
  const { projectId, mapId } = useParams();
  return <Navigate to={`/projects/${projectId}/maps/${mapId}/monitor`} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <VehicleRealtimeProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </VehicleRealtimeProvider>
    </AuthProvider>
  );
}

export { useAuth } from './app/auth/AuthProvider';
export { API_BASE } from './shared/api/config';
