import { useEffect, useMemo, useState } from 'react';
import { Battery, Check, Copy, Cpu, Gauge, KeyRound, MapPinOff, MemoryStick, Plus, Radio, Search, Trash2, Truck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../app/auth/AuthProvider';
import { useProjectVehicles } from '../app/realtime/VehicleRealtimeProvider';
import { parseProjectMapList, type ProjectMap } from '../features/maps/model';
import { parseVehicle, type Vehicle, type VehicleStatus } from '../features/vehicles/model';
import { apiRequest } from '../shared/api/client';
import { isAbortError } from '../shared/api/errors';
import { EmptyState } from '../shared/ui/EmptyState';
import { ErrorState } from '../shared/ui/ErrorState';
import { PageHeader } from '../shared/ui/PageHeader';
import { StatusBadge } from '../shared/ui/StatusBadge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from './ui/alert-dialog';
import { Button } from './ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';

interface PerformanceMonitorProps {
  projectId: string;
}

const statusText: Record<VehicleStatus, string> = {
  online: '在线',
  offline: '离线',
  error: '异常',
};

interface DeviceCredentialStatus {
  configured?: boolean;
  enabled?: boolean;
  token_hint?: string | null;
  device_token?: string;
}

function metric(value: number): string {
  return `${Math.round(value)}%`;
}

export function PerformanceMonitor({ projectId }: PerformanceMonitorProps) {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { vehicles, loading, error, connectionState, refresh, upsert, remove } = useProjectVehicles(projectId);
  const [actionError, setActionError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [ip, setIp] = useState('');
  const [mapId, setMapId] = useState('');
  const [maps, setMaps] = useState<ProjectMap[]>([]);
  const [mapsLoading, setMapsLoading] = useState(true);
  const [updatingMapVehicleId, setUpdatingMapVehicleId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [vehicleToDelete, setVehicleToDelete] = useState<Vehicle | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [credentialVehicle, setCredentialVehicle] = useState<Vehicle | null>(null);
  const [credentialStatus, setCredentialStatus] = useState<DeviceCredentialStatus | null>(null);
  const [credentialLoading, setCredentialLoading] = useState(false);
  const [credentialError, setCredentialError] = useState('');
  const [copied, setCopied] = useState(false);
  const query = searchParams.get('q') || '';
  const status = searchParams.get('status') || 'all';

  useEffect(() => {
    const controller = new AbortController();
    setMapsLoading(true);
    void apiRequest(`/api/projects/${projectId}/maps`, { token, signal: controller.signal })
      .then((payload) => setMaps(parseProjectMapList(payload)))
      .catch((requestError) => {
        if (isAbortError(requestError)) return;
        setActionError(requestError instanceof Error ? requestError.message : '无法读取项目地图');
      })
      .finally(() => {
        if (!controller.signal.aborted) setMapsLoading(false);
      });
    return () => controller.abort();
  }, [projectId, token]);

  const filtered = useMemo(() => vehicles.filter((vehicle) => {
    const matchesQuery = `${vehicle.name} ${vehicle.ip}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (status === 'all' || vehicle.status === status);
  }), [query, status, vehicles]);

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === 'all') next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const createVehicle = async () => {
    if (!name.trim() || !ip.trim()) {
      setFormError('请填写车辆名称和 IP 地址');
      return;
    }
    if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip.trim()) ||
        ip.trim().split('.').some((part) => Number(part) > 255)) {
      setFormError('请输入有效的 IPv4 地址');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      const payload = await apiRequest<{ vehicle?: unknown }>('/api/vehicles', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: name.trim(),
          ip: ip.trim(),
          project_id: projectId,
          ...(mapId ? { map_id: mapId } : {}),
        }),
      });
      if (!payload.vehicle) throw new Error('服务端未返回车辆数据');
      upsert(parseVehicle(payload.vehicle));
      setName('');
      setIp('');
      setMapId('');
      setShowCreate(false);
    } catch (requestError) {
      setFormError(requestError instanceof Error ? requestError.message : '添加车辆失败');
    } finally {
      setSubmitting(false);
    }
  };

  const updateVehicleMap = async (vehicle: Vehicle, nextMapId: string) => {
    if (updatingMapVehicleId) return;
    setUpdatingMapVehicleId(vehicle.id);
    setActionError('');
    try {
      const payload = await apiRequest<{ vehicle?: unknown }>(`/api/vehicles/${vehicle.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ map_id: nextMapId || null }),
      });
      if (!payload.vehicle) throw new Error('服务端未返回车辆数据');
      upsert(parseVehicle(payload.vehicle));
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : '更新车辆地图失败');
    } finally {
      setUpdatingMapVehicleId(null);
    }
  };

  const openCreate = () => {
    setMapId(maps.find((map) => map.isDefault)?.id || '');
    setShowCreate(true);
  };

  const deleteVehicle = async () => {
    if (!vehicleToDelete || deleting) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/vehicles/${vehicleToDelete.id}`, { method: 'DELETE', token });
      remove(vehicleToDelete.id);
      setVehicleToDelete(null);
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : '删除车辆失败');
    } finally {
      setDeleting(false);
    }
  };

  const openCredential = async (vehicle: Vehicle) => {
    setCredentialVehicle(vehicle);
    setCredentialStatus(null);
    setCredentialError('');
    setCopied(false);
    setCredentialLoading(true);
    try {
      setCredentialStatus(await apiRequest<DeviceCredentialStatus>(`/api/vehicles/${vehicle.id}/device-token`, { token }));
    } catch (requestError) {
      setCredentialError(requestError instanceof Error ? requestError.message : '无法读取设备凭据状态');
    } finally {
      setCredentialLoading(false);
    }
  };

  const issueCredential = async () => {
    if (!credentialVehicle || credentialLoading) return;
    setCredentialLoading(true);
    setCredentialError('');
    setCopied(false);
    try {
      setCredentialStatus(await apiRequest<DeviceCredentialStatus>(`/api/vehicles/${credentialVehicle.id}/device-token`, { method: 'POST', token }));
    } catch (requestError) {
      setCredentialError(requestError instanceof Error ? requestError.message : '生成设备凭据失败');
    } finally {
      setCredentialLoading(false);
    }
  };

  const revokeCredential = async () => {
    if (!credentialVehicle || credentialLoading) return;
    setCredentialLoading(true);
    setCredentialError('');
    try {
      await apiRequest(`/api/vehicles/${credentialVehicle.id}/device-token`, { method: 'DELETE', token });
      setCredentialStatus({ configured: false, enabled: false, token_hint: null });
      setCopied(false);
    } catch (requestError) {
      setCredentialError(requestError instanceof Error ? requestError.message : '撤销设备凭据失败');
    } finally {
      setCredentialLoading(false);
    }
  };

  const copyCredential = async () => {
    if (!credentialStatus?.device_token) return;
    try {
      await navigator.clipboard.writeText(credentialStatus.device_token);
      setCopied(true);
    } catch {
      setCredentialError('复制失败，请手动选择凭据文本');
    }
  };

  return (
    <section className="space-y-5">
      <PageHeader
        title="车辆"
        description="查看本项目车辆状态、性能快照与地图绑定。"
        actions={<><span className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-medium ${connectionState === 'live' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : connectionState === 'connecting' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}><Radio className="size-3.5" />{connectionState === 'live' ? '实时连接' : connectionState === 'connecting' ? '正在连接' : connectionState === 'offline' ? '实时服务离线' : '轮询保障'}</span><Button onClick={openCreate}><Plus />添加车辆</Button></>}
      />

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" />
          <span className="sr-only">搜索车辆</span>
          <Input value={query} onChange={(event) => updateParam('q', event.target.value)} className="pl-9" placeholder="按名称或 IP 搜索" />
        </label>
        <label>
          <span className="sr-only">状态筛选</span>
          <select value={status} onChange={(event) => updateParam('status', event.target.value)} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm">
            <option value="all">全部状态</option>
            <option value="online">在线</option>
            <option value="offline">离线</option>
            <option value="error">异常</option>
          </select>
        </label>
      </div>

      {(error || actionError) && <ErrorState message={actionError || error} onRetry={() => { setActionError(''); void refresh(); }} />}
      {loading && <div className="rounded-lg border bg-white p-8 text-center text-slate-500">正在加载车辆…</div>}
      {!loading && !error && vehicles.length === 0 && (
        <EmptyState title="项目中还没有车辆" description="添加车辆后，可在这里查看状态并绑定项目地图。" action={<Button onClick={openCreate}><Plus />添加第一辆车</Button>} />
      )}
      {!loading && !error && vehicles.length > 0 && filtered.length === 0 && (
        <EmptyState title="没有匹配的车辆" description="调整搜索词或状态筛选后重试。" />
      )}

      {!loading && filtered.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="hidden grid-cols-[minmax(180px,1.4fr)_130px_repeat(4,minmax(82px,.55fr))_92px] gap-3 border-b bg-slate-50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500 lg:grid">
            <span>车辆</span><span>状态</span><span>CPU</span><span>内存</span><span>电量</span><span>定位</span><span>操作</span>
          </div>
          <ul className="divide-y divide-slate-200">
            {filtered.map((vehicle) => (
              <li key={vehicle.id} className="grid gap-4 p-4 lg:grid-cols-[minmax(180px,1.4fr)_130px_repeat(4,minmax(82px,.55fr))_92px] lg:items-center lg:gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-md bg-blue-50 text-blue-700"><Truck className="size-5" /></span>
                  <div className="min-w-0"><p className="truncate font-medium text-slate-950">{vehicle.name}</p><p className="truncate text-xs text-slate-500">{vehicle.ip}</p></div>
                </div>
                <div><StatusBadge status={vehicle.status} label={statusText[vehicle.status]} /></div>
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:contents">
                  <span className="flex items-center gap-1.5 text-slate-700"><Cpu className="size-4 text-slate-400 lg:hidden" />{metric(vehicle.cpu)}</span>
                  <span className="flex items-center gap-1.5 text-slate-700"><MemoryStick className="size-4 text-slate-400 lg:hidden" />{metric(vehicle.memory)}</span>
                  <span className="flex items-center gap-1.5 text-slate-700"><Battery className="size-4 text-slate-400 lg:hidden" />{metric(vehicle.battery)}</span>
                  <span className="flex items-center gap-1.5 text-slate-700"><Gauge className="size-4 text-slate-400 lg:hidden" />{metric(vehicle.localizationConfidence)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 lg:contents">
                  <label className="flex min-w-0 items-center gap-1 text-xs lg:col-start-1 lg:row-start-2">
                    {!vehicle.mapId && <MapPinOff className="size-3.5 shrink-0 text-amber-700" />}
                    <span className="sr-only">{vehicle.name} 绑定地图</span>
                    <select
                      value={vehicle.mapId || ''}
                      disabled={mapsLoading || updatingMapVehicleId === vehicle.id}
                      onChange={(event) => void updateVehicleMap(vehicle, event.target.value)}
                      className={`h-8 min-w-0 max-w-44 rounded-md border bg-white px-2 text-xs ${vehicle.mapId ? 'border-slate-200 text-slate-700' : 'border-amber-200 text-amber-800'}`}
                    >
                      <option value="">未绑定地图</option>
                      {maps.map((map) => <option key={map.id} value={map.id}>{map.name}{map.isDefault ? '（默认）' : ''}</option>)}
                    </select>
                  </label>
                  <div className="flex items-center lg:col-start-7 lg:row-start-1">
                    <Button variant="ghost" size="icon" aria-label={`管理 ${vehicle.name} 的设备凭据`} onClick={() => void openCredential(vehicle)} className="text-blue-700"><KeyRound /></Button>
                    <Button variant="ghost" size="icon" aria-label={`删除 ${vehicle.name}`} onClick={() => setVehicleToDelete(vehicle)} className="text-red-700"><Trash2 /></Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={(open) => { if (!submitting) { setShowCreate(open); setFormError(''); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>添加车辆</DialogTitle><DialogDescription>车辆会归属当前项目，之后可绑定到该项目的一张地图。</DialogDescription></DialogHeader>
          <div className="space-y-4">
            {formError && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{formError}</p>}
            <label className="block space-y-1.5"><span className="text-sm font-medium">车辆名称</span><Input value={name} onChange={(event) => setName(event.target.value)} autoFocus /></label>
            <label className="block space-y-1.5"><span className="text-sm font-medium">IPv4 地址</span><Input value={ip} onChange={(event) => setIp(event.target.value)} placeholder="192.168.1.10" /></label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">绑定地图 <span className="font-normal text-slate-500">（可选）</span></span>
              <select value={mapId} onChange={(event) => setMapId(event.target.value)} disabled={mapsLoading} className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
                <option value="">暂不绑定</option>
                {maps.map((map) => <option key={map.id} value={map.id}>{map.name}{map.isDefault ? '（默认）' : ''}</option>)}
              </select>
              {!mapsLoading && maps.length === 0 && <p className="text-xs text-amber-700">当前项目尚无地图，可创建车辆后再绑定。</p>}
            </label>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowCreate(false)} disabled={submitting}>取消</Button><Button onClick={() => void createVehicle()} disabled={submitting}>{submitting ? '添加中…' : '添加车辆'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(credentialVehicle)} onOpenChange={(open) => { if (!open && !credentialLoading) { setCredentialVehicle(null); setCredentialStatus(null); setCredentialError(''); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>设备接入凭据</DialogTitle><DialogDescription>为“{credentialVehicle?.name}”生成独立凭据。设备上报时必须同时使用该车辆 ID，凭据仅在生成后显示一次。</DialogDescription></DialogHeader>
          <div className="space-y-4">
            {credentialError && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{credentialError}</p>}
            {credentialLoading && !credentialStatus ? <p className="text-sm text-slate-500">正在读取凭据状态…</p> : (
              <>
                <dl className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-slate-500">车辆 ID</dt><dd className="mt-1 break-all font-mono text-xs text-slate-800">{credentialVehicle?.id}</dd></div>
                  <div><dt className="text-xs text-slate-500">凭据状态</dt><dd className={`mt-1 font-medium ${credentialStatus?.enabled ? 'text-emerald-700' : 'text-slate-600'}`}>{credentialStatus?.enabled ? `已启用 · 尾号 ${credentialStatus.token_hint || '未知'}` : '未启用'}</dd></div>
                </dl>
                {credentialStatus?.device_token && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm font-medium text-amber-950">请立即保存，关闭后无法再次查看</p>
                    <div className="mt-3 flex items-center gap-2"><code className="min-w-0 flex-1 select-all overflow-x-auto rounded-md border border-amber-200 bg-white px-3 py-2 text-xs text-slate-900">{credentialStatus.device_token}</code><Button variant="outline" size="icon" onClick={() => void copyCredential()} aria-label="复制设备凭据">{copied ? <Check /> : <Copy />}</Button></div>
                  </div>
                )}
                {credentialStatus?.configured && !credentialStatus.device_token && <p className="rounded-md bg-blue-50 p-3 text-sm text-blue-800">平台不保存明文凭据。如设备端已经遗失，请生成新凭据并同步更新设备配置。</p>}
              </>
            )}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => void revokeCredential()} disabled={credentialLoading || !credentialStatus?.configured} className="text-red-700">撤销凭据</Button>
            <Button onClick={() => void issueCredential()} disabled={credentialLoading}>{credentialLoading ? '处理中…' : credentialStatus?.configured ? '轮换凭据' : '生成凭据'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(vehicleToDelete)} onOpenChange={(open) => { if (!open && !deleting) setVehicleToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>删除车辆“{vehicleToDelete?.name}”？</AlertDialogTitle><AlertDialogDescription>该操作会移除车辆及其当前状态记录，无法撤销。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel><AlertDialogAction disabled={deleting} onClick={(event) => { event.preventDefault(); void deleteVehicle(); }} className="bg-red-700 hover:bg-red-800">{deleting ? '删除中…' : '删除车辆'}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
