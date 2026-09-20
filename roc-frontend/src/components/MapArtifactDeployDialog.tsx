import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, FileImage, Loader2, Radio, RefreshCw, Rocket, RotateCcw, Square, XCircle } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useProjectVehicles } from '../app/realtime/VehicleRealtimeProvider';
import { deploymentTerminal, parseDeploymentResponse, retryableVehicleIds, stateLabel, type Deployment, type DeploymentTaskState } from '../features/deployments/model';
import { parseMapArtifactList, parseMapArtifactResponse, type MapArtifact } from '../features/maps/artifacts';
import type { ProjectMap } from '../features/maps/model';
import type { Vehicle } from '../features/vehicles/model';
import { apiRequest } from '../shared/api/client';
import { formatKilobytes } from '../shared/formatKilobytes';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';

interface Props { projectId: string; map: ProjectMap; token: string | null; open: boolean; onClose: () => void }
const cancellable = new Set<DeploymentTaskState>(['queued', 'offered', 'accepted', 'downloading']);

function key(artifactId: string) {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `map:${artifactId}:${suffix}`.slice(0, 128);
}

function tone(state: DeploymentTaskState) {
  if (state === 'delivered') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (state === 'failed' || state === 'expired') return 'border-red-200 bg-red-50 text-red-800';
  if (state === 'canceled') return 'border-slate-200 bg-slate-100 text-slate-700';
  return 'border-blue-200 bg-blue-50 text-blue-800';
}

function icon(state: DeploymentTaskState) {
  if (state === 'delivered') return <CheckCircle2 className="size-4" />;
  if (state === 'failed' || state === 'expired') return <AlertCircle className="size-4" />;
  if (state === 'canceled') return <XCircle className="size-4" />;
  if (state === 'queued') return <Clock3 className="size-4" />;
  return <Radio className="size-4" />;
}

export function MapArtifactDeployDialog({ projectId, map, token, open, onClose }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const batchId = searchParams.get('mapDeploymentMap') === map.id
    ? searchParams.get('mapDeployment')
    : null;
  const { vehicles, loading: vehiclesLoading, refresh } = useProjectVehicles(projectId);
  const [artifact, setArtifact] = useState<MapArtifact | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingArtifact, setCreatingArtifact] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const eligible = useMemo(() => vehicles.filter((vehicle) => vehicle.deviceEnabled), [vehicles]);
  const vehicleById = useMemo(() => new Map(vehicles.map((vehicle) => [vehicle.id, vehicle])), [vehicles]);

  const setBatch = useCallback((id: string | null) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (id) {
        next.set('mapDeployment', id);
        next.set('mapDeploymentMap', map.id);
      } else {
        next.delete('mapDeployment');
        next.delete('mapDeploymentMap');
      }
      return next;
    }, { replace: true });
  }, [map.id, setSearchParams]);

  const readBatch = useCallback(async (id: string) => parseDeploymentResponse(
    await apiRequest(`/api/projects/${projectId}/deployments/${id}`, { token }),
  ), [projectId, token]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    void apiRequest(`/api/projects/${projectId}/maps/${map.id}/artifacts`, { token, signal: controller.signal })
      .then(parseMapArtifactList).then((result) => setArtifact(result.current))
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : '无法读取地图制品'))
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [map.id, open, projectId, token]);

  useEffect(() => {
    if (!open || !batchId) return;
    void readBatch(batchId).then((result) => {
      if (result.resourceType !== 'map') throw new Error('该批次不是地图下发任务');
      setDeployment(result);
    }).catch((requestError) => setError(requestError instanceof Error ? requestError.message : '无法读取下发批次'));
  }, [batchId, open, readBatch]);

  useEffect(() => {
    if (!artifact || !deployment || deployment.resourceRevisionId === artifact.id) return;
    setDeployment(null);
    setError('该批次不属于当前地图制品版本');
  }, [artifact, deployment]);

  useEffect(() => {
    if (!deployment || deploymentTerminal(deployment)) return;
    const timer = window.setInterval(() => void readBatch(deployment.id).then(setDeployment).catch(() => undefined), 3_000);
    return () => window.clearInterval(timer);
  }, [deployment, readBatch]);

  const createArtifact = async () => {
    setCreatingArtifact(true); setError('');
    try {
      const payload = await apiRequest(`/api/projects/${projectId}/maps/${map.id}/artifacts`, { method: 'POST', token });
      setArtifact(parseMapArtifactResponse(payload));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '生成地图制品失败');
    } finally { setCreatingArtifact(false); }
  };

  const createDeployment = async (vehicleIds: string[]) => {
    if (!artifact || vehicleIds.length === 0) return;
    setBusy(true); setError('');
    try {
      const created = parseDeploymentResponse(await apiRequest(`/api/projects/${projectId}/deployments`, {
        method: 'POST', token, body: JSON.stringify({ resource_type: 'map', resource_revision_id: artifact.id, idempotency_key: key(artifact.id), vehicle_ids: vehicleIds }),
      }));
      setDeployment(created); setConfirming(false); setSelected(new Set()); setBatch(created.id);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '创建地图下发任务失败'); }
    finally { setBusy(false); }
  };

  const cancel = async () => {
    if (!deployment) return;
    setBusy(true); setError('');
    try {
      setDeployment(parseDeploymentResponse(await apiRequest(`/api/projects/${projectId}/deployments/${deployment.id}/cancel`, { method: 'POST', token })));
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '取消下发失败'); }
    finally { setBusy(false); }
  };

  const reset = () => { setDeployment(null); setSelected(new Set()); setConfirming(false); setError(''); setBatch(null); };
  const chosen = eligible.filter((vehicle) => selected.has(vehicle.id));
  const retryIds = deployment ? retryableVehicleIds(deployment) : [];

  return <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
    <DialogContent className="max-h-[88vh] overflow-hidden p-0 sm:max-w-3xl">
      <DialogHeader className="border-b border-slate-200 px-6 py-5 pr-12"><DialogTitle>地图原图下发</DialogTitle><DialogDescription>把“{map.name}”的不可变原始图片发送给指定车辆；平台不转换格式，也不代表车辆已加载。</DialogDescription></DialogHeader>
      <div className="min-h-0 overflow-y-auto px-6 py-5">
        {error && <div className="mb-4 flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="size-4 shrink-0" />{error}</div>}
        {loading ? <p className="text-sm text-slate-500">正在读取地图制品…</p> : !artifact ? <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center"><FileImage className="mx-auto size-9 text-slate-400" /><h3 className="mt-3 font-semibold">尚无不可变地图制品</h3><p className="mt-1 text-sm text-slate-500">旧地图需要先把当前原始图片固化为 v1；新上传地图会自动生成。</p><Button className="mt-4" disabled={creatingArtifact} onClick={() => void createArtifact()}>{creatingArtifact ? <Loader2 className="animate-spin" /> : <FileImage />}生成当前图片版本</Button></div> : <>
          <div className="grid gap-3 rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm sm:grid-cols-4"><div><span className="block text-xs text-violet-700">地图制品</span><strong>v{artifact.version}</strong></div><div><span className="block text-xs text-violet-700">格式</span><strong>{artifact.contentType}</strong></div><div><span className="block text-xs text-violet-700">大小</span><strong>{formatKilobytes(artifact.byteSize)}</strong></div><div className="min-w-0"><span className="block text-xs text-violet-700">SHA-256</span><strong className="block truncate font-mono" title={artifact.sha256}>{artifact.sha256}</strong></div></div>
          {deployment ? <div className="mt-5"><div className="flex items-center justify-between"><div><h3 className="font-semibold">逐车状态</h3><p className="text-sm text-slate-500">{deploymentTerminal(deployment) ? '批次已结束' : '每 3 秒刷新'} · 已送达 {deployment.tasks.filter((task) => task.state === 'delivered').length}/{deployment.tasks.length}</p></div></div><ul className="mt-4 space-y-3">{deployment.tasks.map((task) => { const vehicle = vehicleById.get(task.vehicleId); return <li key={task.id} className="rounded-lg border p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-medium">{vehicle?.name || `车辆 ${task.vehicleId.slice(0, 8)}`}</p><p className="text-xs text-slate-500">进度 {task.progress}% · 尝试 {task.attempt}/{task.maxAttempts}</p></div><span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${tone(task.state)}`}>{icon(task.state)}{stateLabel(task.state)}</span></div>{task.errorMessage && <p className="mt-2 rounded bg-red-50 px-3 py-2 text-xs text-red-700">{task.errorCode}：{task.errorMessage}</p>}</li>; })}</ul></div> : confirming ? <div className="mt-5"><h3 className="font-semibold">确认创建地图下发批次</h3><p className="mt-2 text-sm text-slate-600">将原始图片制品 v{artifact.version} 下发至 {chosen.length} 辆车。任务创建不代表文件已送达。</p><ul className="mt-4 divide-y rounded-lg border">{chosen.map((vehicle) => <li key={vehicle.id} className="flex justify-between px-4 py-3 text-sm"><strong>{vehicle.name}</strong><span className={vehicle.status === 'online' ? 'text-emerald-700' : 'text-amber-700'}>{vehicle.status === 'online' ? '在线' : '离线，将等待上线'}</span></li>)}</ul></div> : <div className="mt-5"><div className="flex items-center justify-between"><div><h3 className="font-semibold">选择目标车辆</h3><p className="text-sm text-slate-500">同项目车辆均可选择；未启用 Device Token 的车辆不可下发。</p></div><Button size="sm" variant="ghost" onClick={() => void refresh()}><RefreshCw />刷新</Button></div>{vehiclesLoading && vehicles.length === 0 ? <p className="mt-4 text-sm text-slate-500">正在读取车辆…</p> : vehicles.length === 0 ? <div className="mt-4 rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">项目中还没有车辆。</div> : <ul className="mt-4 divide-y rounded-lg border">{vehicles.map((vehicle) => <VehicleRow key={vehicle.id} vehicle={vehicle} artifact={artifact} checked={selected.has(vehicle.id)} onChange={(checked) => setSelected((current) => { const next = new Set(current); if (checked) next.add(vehicle.id); else next.delete(vehicle.id); return next; })} />)}</ul>}</div>}
        </>}
      </div>
      {artifact && <DialogFooter className="border-t border-slate-200 px-6 py-4">{deployment ? <><Button variant="outline" onClick={reset}>选择其他车辆</Button>{deployment.tasks.some((task) => cancellable.has(task.state)) && <Button variant="outline" disabled={busy} onClick={() => void cancel()}><Square />取消未交付任务</Button>}{retryIds.length > 0 && <Button disabled={busy} onClick={() => void createDeployment(retryIds)}><RotateCcw />按原版本重试 {retryIds.length} 辆</Button>}</> : confirming ? <><Button variant="outline" onClick={() => setConfirming(false)}>返回修改</Button><Button disabled={busy} onClick={() => void createDeployment(chosen.map((vehicle) => vehicle.id))}>{busy ? <Loader2 className="animate-spin" /> : <Rocket />}确认创建任务</Button></> : <Button disabled={selected.size === 0} onClick={() => setConfirming(true)}>下一步：确认 {selected.size} 辆车</Button>}</DialogFooter>}
    </DialogContent>
  </Dialog>;
}

function VehicleRow({ vehicle, artifact, checked, onChange }: { vehicle: Vehicle; artifact: MapArtifact; checked: boolean; onChange: (checked: boolean) => void }) {
  return <li className="flex items-center gap-3 px-4 py-3"><Checkbox id={`map-deploy-${vehicle.id}`} checked={checked} disabled={!vehicle.deviceEnabled} onCheckedChange={(value) => onChange(value === true)} /><label htmlFor={`map-deploy-${vehicle.id}`} className={`min-w-0 flex-1 ${vehicle.deviceEnabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}><span className="block truncate text-sm font-medium">{vehicle.name}</span><span className="block text-xs text-slate-500">{vehicle.ip} · {!vehicle.deviceEnabled ? '尚未启用 Device Token' : vehicle.status === 'online' ? '在线，可立即领取' : '离线，任务将排队'}</span></label>{vehicle.deliveredMapArtifactId === artifact.id && <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700">已送达此版本</span>}</li>;
}
