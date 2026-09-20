import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, CheckCircle2, Clock3, Loader2, Radio, RefreshCw,
  Rocket, RotateCcw, Square, XCircle,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useProjectVehicles } from '../app/realtime/VehicleRealtimeProvider';
import {
  deploymentTerminal, parseDeploymentResponse, retryableVehicleIds, stateLabel,
  type Deployment, type DeploymentTask, type DeploymentTaskState,
} from '../features/deployments/model';
import type { RoadNetworkRevision } from '../features/road-network/model';
import type { Vehicle } from '../features/vehicles/model';
import { apiRequest } from '../shared/api/client';
import { formatKilobytes } from '../shared/formatKilobytes';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from './ui/dialog';

interface RoadNetworkDeployDialogProps {
  projectId: string;
  mapId: string;
  token: string | null;
  revision: RoadNetworkRevision;
  dirty: boolean;
}

const cancellableStates = new Set<DeploymentTaskState>(['queued', 'offered', 'accepted', 'downloading']);

function makeIdempotencyKey(revisionId: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `road-network:${revisionId}:${suffix}`.slice(0, 128);
}

function statusTone(state: DeploymentTaskState): string {
  if (state === 'delivered') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (state === 'failed' || state === 'expired') return 'border-red-200 bg-red-50 text-red-800';
  if (state === 'canceled') return 'border-slate-200 bg-slate-100 text-slate-700';
  return 'border-blue-200 bg-blue-50 text-blue-800';
}

function statusIcon(state: DeploymentTaskState) {
  if (state === 'delivered') return <CheckCircle2 className="size-4" />;
  if (state === 'failed' || state === 'expired') return <AlertCircle className="size-4" />;
  if (state === 'canceled') return <XCircle className="size-4" />;
  if (state === 'queued') return <Clock3 className="size-4" />;
  return <Radio className="size-4" />;
}

function vehicleReason(vehicle: Vehicle, mapId: string): string | null {
  if (vehicle.mapId !== mapId) return '未绑定当前地图';
  if (!vehicle.deviceEnabled) return '尚未启用 Device Token';
  return null;
}

export function RoadNetworkDeployDialog({
  projectId, mapId, token, revision, dirty,
}: RoadNetworkDeployDialogProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialBatchId = searchParams.get('deployment');
  const { vehicles, loading: vehiclesLoading, error: vehiclesError, refresh } = useProjectVehicles(projectId);
  const [open, setOpen] = useState(Boolean(initialBatchId));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const sameMapVehicles = useMemo(
    () => vehicles.filter((vehicle) => vehicle.mapId === mapId),
    [mapId, vehicles],
  );
  const eligibleVehicles = useMemo(
    () => sameMapVehicles.filter((vehicle) => !vehicleReason(vehicle, mapId)),
    [mapId, sameMapVehicles],
  );
  const vehicleById = useMemo(
    () => new Map(vehicles.map((vehicle) => [vehicle.id, vehicle])),
    [vehicles],
  );

  const setBatchQuery = useCallback((batchId: string | null) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (batchId) next.set('deployment', batchId);
      else next.delete('deployment');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const readDeployment = useCallback(async (batchId: string) => {
    const payload = await apiRequest(`/api/projects/${projectId}/deployments/${batchId}`, { token });
    return parseDeploymentResponse(payload);
  }, [projectId, token]);

  useEffect(() => {
    if (!initialBatchId) return;
    let active = true;
    setOpen(true);
    setError('');
    void readDeployment(initialBatchId)
      .then((loaded) => { if (active) setDeployment(loaded); })
      .catch((requestError) => {
        if (active) setError(requestError instanceof Error ? requestError.message : '无法读取下发批次');
      });
    return () => { active = false; };
  }, [initialBatchId, readDeployment]);

  useEffect(() => {
    if (!deployment || deploymentTerminal(deployment)) return;
    const timer = window.setInterval(() => {
      void readDeployment(deployment.id)
        .then(setDeployment)
        .catch((requestError) => setError(requestError instanceof Error ? requestError.message : '刷新下发状态失败'));
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [deployment, readDeployment]);

  const toggleVehicle = (vehicleId: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(vehicleId);
      else next.delete(vehicleId);
      return next;
    });
  };

  const createDeployment = async (vehicleIds: string[]) => {
    if (vehicleIds.length === 0 || busy) return;
    setBusy(true);
    setError('');
    try {
      const payload = await apiRequest(`/api/projects/${projectId}/deployments`, {
        method: 'POST', token,
        body: JSON.stringify({
          resource_type: 'road_network',
          resource_revision_id: revision.id,
          idempotency_key: makeIdempotencyKey(revision.id),
          vehicle_ids: vehicleIds,
        }),
      });
      const created = parseDeploymentResponse(payload);
      setDeployment(created);
      setConfirming(false);
      setSelectedIds(new Set());
      setBatchQuery(created.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '创建下发批次失败');
    } finally {
      setBusy(false);
    }
  };

  const cancelDeployment = async () => {
    if (!deployment || busy) return;
    setBusy(true);
    setError('');
    try {
      const payload = await apiRequest(
        `/api/projects/${projectId}/deployments/${deployment.id}/cancel`,
        { method: 'POST', token },
      );
      setDeployment(parseDeploymentResponse(payload));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '取消下发失败');
    } finally {
      setBusy(false);
    }
  };

  const startNew = () => {
    setDeployment(null);
    setConfirming(false);
    setSelectedIds(new Set());
    setError('');
    setBatchQuery(null);
  };

  const selectedVehicles = eligibleVehicles.filter((vehicle) => selectedIds.has(vehicle.id));
  const retryIds = deployment ? retryableVehicleIds(deployment) : [];
  const hasCancellable = deployment?.tasks.some((task) => cancellableStates.has(task.state)) ?? false;

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setConfirming(false); }}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          disabled={dirty}
          title={dirty ? '请先保存当前草稿，再下发不可变版本' : `下发路网 v${revision.version}`}
        >
          <Rocket />下发 v{revision.version}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-slate-200 px-6 py-5 pr-12">
          <DialogTitle>路网版本下发</DialogTitle>
          <DialogDescription>
            将不可变路网 v{revision.version} 下发给绑定当前地图且已配置 Device Token 的车辆。
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-6 py-5">
          <div className="grid gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm sm:grid-cols-3">
            <div><span className="block text-xs text-blue-700">目标版本</span><strong className="text-blue-950">v{revision.version}</strong></div>
            <div><span className="block text-xs text-blue-700">内容大小</span><strong className="text-blue-950">{formatKilobytes(revision.byteSize)}</strong></div>
            <div className="min-w-0"><span className="block text-xs text-blue-700">SHA-256</span><strong className="block truncate font-mono text-blue-950" title={revision.sha256}>{revision.sha256}</strong></div>
          </div>

          {error && <div className="mt-4 flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="mt-0.5 size-4 shrink-0" />{error}</div>}

          {deployment ? (
            <DeploymentStatus deployment={deployment} vehicleById={vehicleById} />
          ) : confirming ? (
            <div className="mt-5">
              <h3 className="font-semibold text-slate-950">确认创建下发批次</h3>
              <p className="mt-2 text-sm text-slate-600">将路网 v{revision.version} 下发至 {selectedVehicles.length} 辆车。创建任务不代表车辆已经接收或应用。</p>
              <ul className="mt-4 divide-y rounded-lg border border-slate-200">
                {selectedVehicles.map((vehicle) => <li key={vehicle.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><span className="font-medium text-slate-900">{vehicle.name}</span><span className={vehicle.status === 'online' ? 'text-emerald-700' : 'text-amber-700'}>{vehicle.status === 'online' ? '在线' : '离线，将等待上线'}</span></li>)}
              </ul>
            </div>
          ) : (
            <div className="mt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><h3 className="font-semibold text-slate-950">选择目标车辆</h3><p className="mt-1 text-sm text-slate-500">不会自动全选。离线车辆可创建任务，并在上线后领取。</p></div>
                <Button variant="ghost" size="sm" disabled={vehiclesLoading} onClick={() => void refresh()}><RefreshCw className={vehiclesLoading ? 'animate-spin' : ''} />刷新</Button>
              </div>
              {vehiclesError && <p className="mt-3 text-sm text-red-700">{vehiclesError}</p>}
              {vehiclesLoading && vehicles.length === 0 ? <p className="mt-4 text-sm text-slate-500">正在读取车辆…</p> : sameMapVehicles.length === 0 ? <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">当前地图尚未绑定车辆。</div> : <ul className="mt-4 divide-y rounded-lg border border-slate-200">
                {sameMapVehicles.map((vehicle) => {
                  const reason = vehicleReason(vehicle, mapId);
                  return <li key={vehicle.id} className="flex items-center gap-3 px-4 py-3">
                    <Checkbox id={`deploy-${vehicle.id}`} disabled={Boolean(reason)} checked={selectedIds.has(vehicle.id)} onCheckedChange={(checked) => toggleVehicle(vehicle.id, checked === true)} />
                    <label htmlFor={`deploy-${vehicle.id}`} className={`min-w-0 flex-1 ${reason ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                      <span className="block truncate text-sm font-medium text-slate-900">{vehicle.name}</span>
                      <span className="block text-xs text-slate-500">{vehicle.ip} · {reason || (vehicle.status === 'online' ? '在线，可立即领取' : '离线，任务将排队')}</span>
                    </label>
                    {vehicle.deliveredRoadRevisionId === revision.id && <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">已送达此版本</span>}
                  </li>;
                })}
              </ul>}
              {sameMapVehicles.length > 0 && eligibleVehicles.length === 0 && <p className="mt-3 text-sm text-amber-700">没有符合条件的车辆，请先在车辆管理中为车辆启用 Device Token。</p>}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-slate-200 px-6 py-4">
          {deployment ? <>
            <Button variant="outline" onClick={startNew}>选择其他车辆</Button>
            {hasCancellable && <Button variant="outline" disabled={busy} onClick={() => void cancelDeployment()}>{busy ? <Loader2 className="animate-spin" /> : <Square />}取消未交付任务</Button>}
            {retryIds.length > 0 && <Button disabled={busy} onClick={() => void createDeployment(retryIds)}>{busy ? <Loader2 className="animate-spin" /> : <RotateCcw />}按原版本重试 {retryIds.length} 辆</Button>}
          </> : confirming ? <>
            <Button variant="outline" disabled={busy} onClick={() => setConfirming(false)}>返回修改</Button>
            <Button disabled={busy} onClick={() => void createDeployment(selectedVehicles.map((vehicle) => vehicle.id))}>{busy ? <Loader2 className="animate-spin" /> : <Rocket />}确认创建任务</Button>
          </> : <Button disabled={selectedIds.size === 0} onClick={() => setConfirming(true)}>下一步：确认 {selectedIds.size} 辆车</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeploymentStatus({ deployment, vehicleById }: { deployment: Deployment; vehicleById: Map<string, Vehicle> }) {
  const terminal = deploymentTerminal(deployment);
  const delivered = deployment.tasks.filter((task) => task.state === 'delivered').length;
  return <div className="mt-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-semibold text-slate-950">批次状态</h3><p className="mt-1 text-sm text-slate-500">{terminal ? '批次已结束' : '状态每 3 秒自动刷新'} · 已送达 {delivered}/{deployment.tasks.length}</p></div>
      <span className={`rounded-full px-3 py-1 text-xs font-medium ${terminal ? 'bg-slate-100 text-slate-700' : 'bg-blue-100 text-blue-700'}`}>{terminal ? '已结束' : '执行中'}</span>
    </div>
    <p className="mt-3 truncate font-mono text-xs text-slate-400" title={deployment.id}>批次 {deployment.id}</p>
    <ul className="mt-4 space-y-3">
      {deployment.tasks.map((task) => <DeploymentTaskRow key={task.id} task={task} vehicle={vehicleById.get(task.vehicleId)} />)}
    </ul>
  </div>;
}

function DeploymentTaskRow({ task, vehicle }: { task: DeploymentTask; vehicle?: Vehicle }) {
  return <li className="rounded-lg border border-slate-200 p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0"><p className="truncate font-medium text-slate-950">{vehicle?.name || `车辆 ${task.vehicleId.slice(0, 8)}`}</p><p className="mt-1 text-xs text-slate-500">尝试 {task.attempt}/{task.maxAttempts} · 更新于 {new Date(task.updatedAt).toLocaleString('zh-CN')}</p></div>
      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(task.state)}`}>{statusIcon(task.state)}{stateLabel(task.state)}</span>
    </div>
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${Math.max(0, Math.min(100, task.progress))}%` }} /></div>
    <div className="mt-1 flex justify-between text-[11px] text-slate-400"><span>{task.progress}%</span><span>{task.state === 'queued' && vehicle?.status === 'offline' ? '等待车辆上线' : ''}</span></div>
    {(task.errorCode || task.errorMessage) && <p className="mt-2 rounded bg-red-50 px-3 py-2 text-xs text-red-700">{task.errorCode ? `${task.errorCode}：` : ''}{task.errorMessage || '任务失败'}</p>}
  </li>;
}
