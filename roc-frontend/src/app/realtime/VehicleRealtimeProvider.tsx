import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { useAuth } from '../auth/AuthProvider';
import { apiRequest } from '../../shared/api/client';
import { websocketUrl } from '../../shared/api/config';
import { isAbortError } from '../../shared/api/errors';
import { parseVehicle, parseVehicleList, type Vehicle } from '../../features/vehicles/model';
import {
  mergeVehicleEvent, mergeVehicleSnapshot, removeVehicleEvent,
} from '../../features/vehicles/realtimeModel';

export type RealtimeConnectionState = 'connecting' | 'live' | 'fallback' | 'offline';

interface ProjectVehiclesState {
  vehicles: Vehicle[];
  loading: boolean;
  error: string;
  updatedAt: Date | null;
}

interface VehicleRealtimeContextValue {
  projects: Record<string, ProjectVehiclesState>;
  connectionState: RealtimeConnectionState;
  subscribe: (projectId: string) => () => void;
  refresh: (projectId: string, signal?: AbortSignal, quiet?: boolean) => Promise<void>;
  upsert: (projectId: string, vehicle: Vehicle) => void;
  remove: (projectId: string, vehicleId: string) => void;
}

const VehicleRealtimeContext = createContext<VehicleRealtimeContextValue | null>(null);
const emptyProject: ProjectVehiclesState = {
  vehicles: [], loading: true, error: '', updatedAt: null,
};

interface RealtimeMessage {
  type?: string;
  project_id?: string;
  vehicle_id?: string;
  vehicle?: unknown;
  vehicles?: unknown[];
  code?: string;
  message?: string;
}

export function VehicleRealtimeProvider({ children }: { children: ReactNode }) {
  const { status, token } = useAuth();
  const [projects, setProjects] = useState<Record<string, ProjectVehiclesState>>({});
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>('offline');
  const subscriptions = useRef(new Map<string, number>());
  const socketRef = useRef<WebSocket | null>(null);
  const socketAuthenticated = useRef(false);
  const retryAllowed = useRef(true);
  const lastPongAt = useRef(0);

  const updateProject = useCallback((projectId: string, update: (current: ProjectVehiclesState) => ProjectVehiclesState) => {
    setProjects((current) => ({
      ...current,
      [projectId]: update(current[projectId] || emptyProject),
    }));
  }, []);

  const refresh = useCallback(async (projectId: string, signal?: AbortSignal, quiet = false) => {
    if (!token || !projectId) return;
    if (!quiet) updateProject(projectId, (current) => ({ ...current, loading: true, error: '' }));
    try {
      const payload = await apiRequest(`/api/vehicles?project_id=${encodeURIComponent(projectId)}`, { token, signal });
      const incoming = parseVehicleList(payload);
      updateProject(projectId, (current) => ({
        vehicles: mergeVehicleSnapshot(current.vehicles, incoming),
        loading: false,
        error: '',
        updatedAt: new Date(),
      }));
    } catch (error) {
      if (!isAbortError(error)) {
        updateProject(projectId, (current) => ({
          ...current,
          loading: false,
          error: error instanceof Error ? error.message : '无法加载车辆',
        }));
      }
    }
  }, [token, updateProject]);

  const handleRealtimeMessage = useCallback((event: MessageEvent<string>) => {
    let message: RealtimeMessage;
    try {
      message = JSON.parse(event.data) as RealtimeMessage;
    } catch {
      return;
    }

    if (message.type === 'authenticated') {
      socketAuthenticated.current = true;
      lastPongAt.current = Date.now();
      for (const projectId of subscriptions.current.keys()) {
        socketRef.current?.send(JSON.stringify({ type: 'subscribe', project_id: projectId }));
      }
      if (subscriptions.current.size === 0) setConnectionState('live');
      return;
    }

    if (message.type === 'pong') {
      lastPongAt.current = Date.now();
      return;
    }
    if (message.type === 'error') {
      if (['authentication_failed', 'authentication_timeout', 'origin_rejected'].includes(message.code || '')) {
        retryAllowed.current = false;
        setConnectionState('offline');
      }
      return;
    }

    const projectId = message.project_id;
    if (!projectId) return;
    if (message.type === 'snapshot' && Array.isArray(message.vehicles)) {
      try {
        const incoming = parseVehicleList({ vehicles: message.vehicles });
        updateProject(projectId, (current) => ({
          vehicles: mergeVehicleSnapshot(current.vehicles, incoming),
          loading: false,
          error: '',
          updatedAt: new Date(),
        }));
        setConnectionState('live');
      } catch {
        updateProject(projectId, (current) => ({ ...current, error: '实时快照格式不正确' }));
      }
    } else if ((message.type === 'vehicle_updated' || message.type === 'vehicle_created') && message.vehicle) {
      try {
        const incoming = parseVehicle(message.vehicle);
        updateProject(projectId, (current) => ({
          ...current,
          vehicles: mergeVehicleEvent(current.vehicles, incoming),
          updatedAt: new Date(),
        }));
      } catch {
        // Ignore a malformed event; the fallback snapshot will repair state.
      }
    } else if (message.type === 'vehicle_deleted' && message.vehicle_id) {
      updateProject(projectId, (current) => ({
        ...current,
        vehicles: removeVehicleEvent(current.vehicles, message.vehicle_id!),
        updatedAt: new Date(),
      }));
    }
  }, [updateProject]);

  useEffect(() => {
    if (status !== 'authenticated' || !token) {
      socketRef.current?.close();
      socketRef.current = null;
      socketAuthenticated.current = false;
      setConnectionState('offline');
      setProjects({});
      return;
    }

    let active = true;
    let reconnectTimer: number | undefined;
    let heartbeatTimer: number | undefined;
    let attempt = 0;
    retryAllowed.current = true;

    const connect = () => {
      if (!active) return;
      setConnectionState(attempt === 0 ? 'connecting' : 'fallback');
      socketAuthenticated.current = false;
      const socket = new WebSocket(websocketUrl('/ws/status'));
      socketRef.current = socket;

      socket.onopen = () => {
        if (!active) return;
        lastPongAt.current = Date.now();
        socket.send(JSON.stringify({ type: 'authenticate', token }));
      };
      socket.onmessage = handleRealtimeMessage;
      socket.onerror = () => {
        if (active) setConnectionState('fallback');
      };
      socket.onclose = () => {
        if (!active) return;
        socketAuthenticated.current = false;
        window.clearInterval(heartbeatTimer);
        if (!retryAllowed.current) {
          setConnectionState('offline');
          return;
        }
        setConnectionState('fallback');
        attempt += 1;
        const baseDelay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt - 1, 5));
        const delay = Math.round(baseDelay * (0.8 + Math.random() * 0.4));
        reconnectTimer = window.setTimeout(connect, delay);
      };
      heartbeatTimer = window.setInterval(() => {
        if (socket.readyState === WebSocket.OPEN && socketAuthenticated.current) {
          if (Date.now() - lastPongAt.current > 45_000) {
            socket.close();
            return;
          }
          socket.send(JSON.stringify({ type: 'ping' }));
        }
      }, 15_000);
    };

    connect();
    return () => {
      active = false;
      window.clearTimeout(reconnectTimer);
      window.clearInterval(heartbeatTimer);
      socketRef.current?.close();
      socketRef.current = null;
      socketAuthenticated.current = false;
    };
  }, [handleRealtimeMessage, status, token]);

  const subscribe = useCallback((projectId: string) => {
    const count = subscriptions.current.get(projectId) || 0;
    subscriptions.current.set(projectId, count + 1);
    if (count === 0) {
      void refresh(projectId);
      if (socketRef.current?.readyState === WebSocket.OPEN && socketAuthenticated.current) {
        socketRef.current.send(JSON.stringify({ type: 'subscribe', project_id: projectId }));
      }
    }
    return () => {
      const next = (subscriptions.current.get(projectId) || 1) - 1;
      if (next <= 0) {
        subscriptions.current.delete(projectId);
        if (socketRef.current?.readyState === WebSocket.OPEN && socketAuthenticated.current) {
          socketRef.current.send(JSON.stringify({ type: 'unsubscribe', project_id: projectId }));
        }
      } else {
        subscriptions.current.set(projectId, next);
      }
    };
  }, [refresh]);

  useEffect(() => {
    if (connectionState === 'live' || status !== 'authenticated') return;
    const timer = window.setInterval(() => {
      for (const projectId of subscriptions.current.keys()) void refresh(projectId, undefined, true);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [connectionState, refresh, status]);

  const upsert = useCallback((projectId: string, vehicle: Vehicle) => {
    updateProject(projectId, (current) => ({
      ...current,
      vehicles: mergeVehicleEvent(current.vehicles, vehicle),
      updatedAt: new Date(),
    }));
  }, [updateProject]);

  const remove = useCallback((projectId: string, vehicleId: string) => {
    updateProject(projectId, (current) => ({
      ...current,
      vehicles: removeVehicleEvent(current.vehicles, vehicleId),
      updatedAt: new Date(),
    }));
  }, [updateProject]);

  const value = useMemo<VehicleRealtimeContextValue>(() => ({
    projects, connectionState, subscribe, refresh, upsert, remove,
  }), [connectionState, projects, refresh, remove, subscribe, upsert]);

  return <VehicleRealtimeContext.Provider value={value}>{children}</VehicleRealtimeContext.Provider>;
}

export function useProjectVehicles(projectId: string) {
  const context = useContext(VehicleRealtimeContext);
  if (!context) throw new Error('useProjectVehicles must be used within VehicleRealtimeProvider');

  useEffect(() => {
    if (!projectId) return;
    return context.subscribe(projectId);
  }, [context.subscribe, projectId]);

  const state = context.projects[projectId] || emptyProject;
  return {
    ...state,
    connectionState: context.connectionState,
    refresh: (signal?: AbortSignal, quiet?: boolean) => context.refresh(projectId, signal, quiet),
    upsert: (vehicle: Vehicle) => context.upsert(projectId, vehicle),
    remove: (vehicleId: string) => context.remove(projectId, vehicleId),
  };
}
