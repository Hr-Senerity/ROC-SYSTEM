import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Battery, Download, Edit3, Focus, Gauge, Layers3, Maximize2, Minimize2,
  RefreshCw, Search, Truck, WifiOff, X,
} from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../app/auth/AuthProvider';
import { useProjectVehicles } from '../app/realtime/VehicleRealtimeProvider';
import {
  fitScale, mapToScreen, screenToMap, worldToMap, type Point, type Size, type ViewTransform,
} from '../features/maps/coordinates';
import { parseProjectMapResponse, type ProjectMap } from '../features/maps/model';
import { useAuthenticatedMapImage } from '../features/maps/useAuthenticatedMapImage';
import { type Vehicle } from '../features/vehicles/model';
import { apiRequest } from '../shared/api/client';
import { isAbortError } from '../shared/api/errors';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface RoadSegment { from: Point; to: Point }

function parseRoadNetwork(value: unknown): RoadSegment[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const source = value as Record<string, unknown>;
  if (!Array.isArray(source.nodes) || !Array.isArray(source.edges)) return [];
  const nodes = new Map<string, Point>();
  source.nodes.forEach((node) => {
    if (!node || typeof node !== 'object') return;
    const item = node as Record<string, unknown>;
    const x = Number(item.x);
    const y = Number(item.y);
    if (typeof item.id === 'string' && Number.isFinite(x) && Number.isFinite(y)) nodes.set(item.id, { x, y });
  });
  return source.edges.flatMap((edge) => {
    if (!edge || typeof edge !== 'object') return [];
    const item = edge as Record<string, unknown>;
    const from = typeof item.from === 'string' ? nodes.get(item.from) : undefined;
    const to = typeof item.to === 'string' ? nodes.get(item.to) : undefined;
    return from && to ? [{ from, to }] : [];
  });
}

function statusLabel(status: Vehicle['status']): string {
  return status === 'online' ? '在线' : status === 'error' ? '异常' : '离线';
}

function clampZoom(value: number): number {
  return Math.max(0.25, Math.min(8, value));
}

export function MapDetailPage() {
  const { projectId, mapId } = useParams();
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('vehicle');
  const [map, setMap] = useState<ProjectMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { vehicles, error: vehicleError, connectionState, updatedAt, refresh: refreshVehicles } = useProjectVehicles(projectId || '');
  const [query, setQuery] = useState('');
  const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 });
  const [naturalImage, setNaturalImage] = useState<Size>({ width: 1000, height: 1000 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [focused, setFocused] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; start: Point; pan: Point } | null>(null);
  const mapImage = useAuthenticatedMapImage(projectId, mapId, token, Boolean(map?.imageUrl));

  const loadData = useCallback(async (signal?: AbortSignal) => {
    if (!projectId || !mapId) return;
    setLoading(true);
    setError('');
    try {
      const mapPayload = await apiRequest(`/api/projects/${projectId}/maps/${mapId}`, { token, signal });
      setMap(parseProjectMapResponse(mapPayload));
    } catch (requestError) {
      if (!isAbortError(requestError)) setError(requestError instanceof Error ? requestError.message : '无法加载地图工作区');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [mapId, projectId, token]);

  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [focused, loading]);

  useEffect(() => {
    if (!focused) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setFocused(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [focused]);

  useEffect(() => {
    if (!mapImage.src || map?.imageWidth || map?.imageHeight) return;
    const imageElement = new Image();
    imageElement.onload = () => {
      if (imageElement.naturalWidth > 0 && imageElement.naturalHeight > 0) {
        setNaturalImage({ width: imageElement.naturalWidth, height: imageElement.naturalHeight });
      }
    };
    imageElement.src = mapImage.src;
    return () => { imageElement.onload = null; };
  }, [map?.imageHeight, map?.imageWidth, mapImage.src]);

  const imageSize = useMemo<Size>(() => ({
    width: map?.imageWidth && map.imageWidth > 0 ? map.imageWidth : naturalImage.width,
    height: map?.imageHeight && map.imageHeight > 0 ? map.imageHeight : naturalImage.height,
  }), [map, naturalImage]);

  const viewTransform = useMemo<ViewTransform>(() => ({
    viewport, image: imageSize, padding: 24, zoom, pan,
  }), [imageSize, pan, viewport, zoom]);

  const coordinateMetadata = useMemo(() => ({
    mode: map?.coordinateMode || 'legacy-normalized' as const,
    image: imageSize,
    origin: { x: map?.coordinateOriginX ?? 0, y: map?.coordinateOriginY ?? 0 },
    originTheta: map?.originTheta ?? 0,
    resolution: map?.resolution ?? null,
  }), [imageSize, map]);

  const mappedRoad = useMemo(() => parseRoadNetwork(map?.roadNetwork).flatMap((segment) => {
    const from = worldToMap(segment.from, coordinateMetadata);
    const to = worldToMap(segment.to, coordinateMetadata);
    return from && to ? [{ from, to }] : [];
  }), [coordinateMetadata, map?.roadNetwork]);

  const mapVehicles = useMemo(() => vehicles.filter((vehicle) => vehicle.mapId === mapId), [mapId, vehicles]);
  const filteredVehicles = useMemo(() => mapVehicles.filter((vehicle) =>
    `${vehicle.name} ${vehicle.ip}`.toLowerCase().includes(query.toLowerCase())), [mapVehicles, query]);
  const selected = vehicles.find((vehicle) => vehicle.id === selectedId) || null;

  const selectVehicle = (vehicleId: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (vehicleId) next.set('vehicle', vehicleId);
    else next.delete('vehicle');
    setSearchParams(next, { replace: true });
  };

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const zoomAt = (screen: Point, nextZoom: number) => {
    if (viewport.width <= 0 || viewport.height <= 0) return;
    const anchor = screenToMap(screen, viewTransform);
    const bounded = clampZoom(nextZoom);
    const nextTransform = { ...viewTransform, zoom: bounded, pan: { x: 0, y: 0 } };
    const scale = fitScale(nextTransform) * bounded;
    setZoom(bounded);
    setPan({
      x: screen.x - viewport.width / 2 - scale * (anchor.x - imageSize.width / 2),
      y: screen.y - viewport.height / 2 - scale * (anchor.y - imageSize.height / 2),
    });
  };

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    zoomAt({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }, zoom * factor);
  };

  const focusVehicle = (vehicle: Vehicle) => {
    selectVehicle(vehicle.id);
    if (!vehicle.position) return;
    const mapPoint = worldToMap(vehicle.position, coordinateMetadata);
    if (!mapPoint) return;
    const current = mapToScreen(mapPoint, viewTransform);
    setPan((value) => ({
      x: value.x + viewport.width / 2 - current.x,
      y: value.y + viewport.height / 2 - current.y,
    }));
  };

  const exportRoad = () => {
    const rows = ['from_x,from_y,to_x,to_y', ...parseRoadNetwork(map?.roadNetwork).map((segment) =>
      `${segment.from.x},${segment.from.y},${segment.to.x},${segment.to.y}`)];
    const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${map?.name || 'map'}-road-network.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-100 text-slate-600">正在加载地图工作区…</main>;
  if (error && !map) return <main className="grid min-h-screen place-items-center bg-slate-100 p-6"><div className="max-w-md rounded-lg border bg-white p-6 text-center"><p className="font-medium text-red-700">{error}</p><Button onClick={() => void loadData()} className="mt-4">重试</Button></div></main>;
  if (!map) return null;

  const scale = viewport.width > 0 && viewport.height > 0 ? fitScale(viewTransform) * zoom : 1;
  const transform = `translate(${viewport.width / 2 + pan.x} ${viewport.height / 2 + pan.y}) scale(${scale}) translate(${-imageSize.width / 2} ${-imageSize.height / 2})`;
  const image = mapImage.src;

  return (
    <div className={focused ? 'fixed inset-0 z-50 flex min-h-0 flex-col bg-slate-100' : 'flex min-h-screen flex-col bg-slate-100'}>
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" asChild><Link to={`/projects/${projectId}/maps`} aria-label="返回项目地图"><ArrowLeft /></Link></Button>
          <div className="min-w-0"><h1 className="truncate font-semibold text-slate-950">{map.name}</h1><p className="text-xs text-slate-500">地图监控 · {map.coordinateMode === 'metric' ? '米制坐标' : '旧版归一化坐标'}</p></div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500"><RefreshCw className={`size-3.5 ${connectionState === 'connecting' ? 'animate-spin' : ''}`} /><span className="hidden sm:inline">{connectionState === 'live' ? '实时更新' : connectionState === 'connecting' ? '正在连接' : '轮询保障'} · </span>{updatedAt?.toLocaleTimeString('zh-CN') || '尚未收到车辆数据'}</div>
      </header>

      {error && <div role="alert" className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">刷新失败：{error}</div>}
      {vehicleError && <div role="alert" className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800"><span>车辆状态刷新失败：{vehicleError}</span><Button variant="ghost" size="sm" onClick={() => void refreshVehicles()}>重试</Button></div>}

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <Button variant="outline" size="sm" onClick={() => zoomAt({ x: viewport.width / 2, y: viewport.height / 2 }, zoom / 1.2)} aria-label="缩小">−</Button>
        <span className="w-14 text-center text-xs text-slate-600">{Math.round(zoom * 100)}%</span>
        <Button variant="outline" size="sm" onClick={() => zoomAt({ x: viewport.width / 2, y: viewport.height / 2 }, zoom * 1.2)} aria-label="放大">＋</Button>
        <Button variant="outline" size="sm" onClick={resetView}><Focus />适应视图</Button>
        <Button variant="outline" size="sm" disabled={mappedRoad.length === 0} onClick={exportRoad}><Download />导出路网</Button>
        <Button variant="outline" size="sm" asChild><Link to={`/projects/${projectId}/maps/${mapId}/edit`}><Edit3 />编辑路网</Link></Button>
        <span className="ml-auto hidden items-center gap-1.5 text-xs text-slate-500 md:flex"><Layers3 className="size-4" />底图 / 路网 / 车辆</span>
        <Button variant="outline" size="icon" onClick={() => setFocused((value) => !value)} aria-label={focused ? '退出专注模式' : '进入专注模式'}>{focused ? <Minimize2 /> : <Maximize2 />}</Button>
      </div>

      <main className="grid min-h-0 flex-1 xl:grid-cols-[240px_minmax(0,1fr)_320px]">
        <aside className="hidden min-h-0 border-r border-slate-200 bg-white xl:flex xl:flex-col">
          <div className="p-3"><label className="relative block"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" /><span className="sr-only">搜索当前地图车辆</span><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索车辆" /></label></div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {filteredVehicles.length === 0 ? <p className="p-4 text-center text-sm text-slate-500">当前地图没有匹配车辆</p> : (
              <ul className="space-y-1">
                {filteredVehicles.map((vehicle) => <li key={vehicle.id}><button type="button" onClick={() => focusVehicle(vehicle)} className={`w-full rounded-md px-3 py-2 text-left ${selectedId === vehicle.id ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-slate-50'}`}><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{vehicle.name}</span><span className={`size-2 rounded-full ${vehicle.status === 'online' ? 'bg-green-500' : vehicle.status === 'error' ? 'bg-red-500' : 'bg-slate-400'}`} /></span><span className="mt-1 block text-xs text-slate-500">{statusLabel(vehicle.status)} · 电量 {Math.round(vehicle.battery)}%</span></button></li>)}
              </ul>
            )}
          </div>
          {vehicles.some((vehicle) => !vehicle.mapId) && <p className="border-t p-3 text-xs text-amber-700"><WifiOff className="mr-1 inline size-3.5" />有 {vehicles.filter((vehicle) => !vehicle.mapId).length} 辆车未绑定地图，因此不会显示位置。</p>}
        </aside>

        <section ref={viewportRef} className="relative min-h-[420px] min-w-0 overflow-hidden bg-slate-200 touch-none">
          <svg
            className="absolute inset-0 size-full cursor-grab active:cursor-grabbing"
            onWheel={handleWheel}
            onPointerDown={(event) => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, pan }; }}
            onPointerMove={(event) => { const state = drag.current; if (!state || state.pointerId !== event.pointerId) return; setPan({ x: state.pan.x + event.clientX - state.start.x, y: state.pan.y + event.clientY - state.start.y }); }}
            onPointerUp={(event) => { if (drag.current?.pointerId === event.pointerId) drag.current = null; }}
            onPointerCancel={() => { drag.current = null; }}
            aria-label={`${map.name} 地图视口`}
          >
            <rect width="100%" height="100%" fill="#e2e8f0" />
            <g transform={transform}>
              <rect width={imageSize.width} height={imageSize.height} fill="white" stroke="#94a3b8" strokeWidth={1 / scale} />
              {image ? <image href={image} width={imageSize.width} height={imageSize.height} preserveAspectRatio="none" /> : <text x={imageSize.width / 2} y={imageSize.height / 2} textAnchor="middle" fill="#64748b" fontSize={16 / scale}>{mapImage.error || (map.imageUrl ? '正在安全加载地图…' : '未上传地图图片')}</text>}
              {mappedRoad.map((segment, index) => <line key={index} x1={segment.from.x} y1={segment.from.y} x2={segment.to.x} y2={segment.to.y} stroke="#475569" strokeWidth={3 / scale} strokeLinecap="round" />)}
              {mapVehicles.flatMap((vehicle) => {
                if (!vehicle.position) return [];
                const point = worldToMap(vehicle.position, coordinateMetadata);
                if (!point) return [];
                const isSelected = vehicle.id === selectedId;
                return [<g key={vehicle.id} role="button" tabIndex={0} aria-label={`选择车辆 ${vehicle.name}`} onClick={(event) => { event.stopPropagation(); selectVehicle(vehicle.id); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') selectVehicle(vehicle.id); }} className="cursor-pointer"><circle cx={point.x} cy={point.y} r={(isSelected ? 13 : 10) / scale} fill={isSelected ? '#f59e0b' : vehicle.status === 'error' ? '#dc2626' : vehicle.status === 'online' ? '#2563eb' : '#64748b'} stroke="white" strokeWidth={3 / scale} /><line x1={point.x} y1={point.y} x2={point.x + Math.cos(vehicle.position.theta) * 16 / scale} y2={point.y + Math.sin(vehicle.position.theta) * 16 / scale} stroke="white" strokeWidth={2.5 / scale} strokeLinecap="round" /></g>];
              })}
            </g>
          </svg>
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-600 shadow-sm"><span className="mr-3"><i className="mr-1 inline-block size-2 rounded-full bg-blue-600" />在线</span><span className="mr-3"><i className="mr-1 inline-block size-2 rounded-full bg-slate-500" />离线</span><span><i className="mr-1 inline-block size-2 rounded-full bg-red-600" />异常</span></div>
          <select value={selectedId || ''} onChange={(event) => selectVehicle(event.target.value || null)} className="absolute left-3 top-3 h-10 max-w-[calc(100%-1.5rem)] rounded-md border bg-white px-3 text-sm shadow-sm xl:hidden" aria-label="选择当前地图车辆"><option value="">选择车辆（{mapVehicles.length}）</option>{mapVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name} · {statusLabel(vehicle.status)}</option>)}</select>
        </section>

        <aside className={`${selected ? 'flex' : 'hidden'} absolute inset-x-3 bottom-3 z-20 max-h-[55vh] flex-col overflow-y-auto rounded-lg border bg-white shadow-xl xl:static xl:flex xl:max-h-none xl:rounded-none xl:border-y-0 xl:border-r-0 xl:shadow-none`}>
          {selected ? <VehicleInspector vehicle={selected} onClose={() => selectVehicle(null)} /> : <div className="hidden h-full place-items-center p-6 text-center text-sm text-slate-500 xl:grid"><Truck className="mb-3 size-8 text-slate-300" /><p>从车辆列表或地图中选择一辆车查看详情</p></div>}
        </aside>
      </main>
    </div>
  );
}

function VehicleInspector({ vehicle, onClose }: { vehicle: Vehicle; onClose: () => void }) {
  return (
    <div className="p-5">
      <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-950">{vehicle.name}</h2><p className="mt-1 text-xs text-slate-500">{vehicle.ip} · {statusLabel(vehicle.status)}</p></div><Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭车辆详情"><X /></Button></div>
      <dl className="mt-5 grid grid-cols-2 gap-3">
        <Metric icon={<Gauge />} label="CPU" value={`${Math.round(vehicle.cpu)}%`} />
        <Metric icon={<Gauge />} label="内存" value={`${Math.round(vehicle.memory)}%`} />
        <Metric icon={<Battery />} label="电量" value={`${Math.round(vehicle.battery)}%`} />
        <Metric icon={<Focus />} label="定位" value={`${Math.round(vehicle.localizationConfidence)}%`} />
      </dl>
      <div className="mt-5 border-t pt-4 text-sm text-slate-600"><p className="font-medium text-slate-900">位置</p>{vehicle.position ? <p className="mt-2 font-mono text-xs">x {vehicle.position.x.toFixed(2)} · y {vehicle.position.y.toFixed(2)} · θ {vehicle.position.theta.toFixed(2)}</p> : <p className="mt-2 text-amber-700">尚未收到有效位置</p>}<p className="mt-3 text-xs text-slate-500">数据时间：{vehicle.receivedAt ? new Date(vehicle.receivedAt).toLocaleString('zh-CN') : '未收到状态'}</p></div>
      <div className="mt-5 rounded-md bg-slate-50 p-3 text-xs text-slate-500">车辆日志接口尚未接入，此处不以空日志表示运行正常。</div>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-md border border-slate-200 p-3"><dt className="flex items-center gap-1.5 text-xs text-slate-500 [&_svg]:size-3.5">{icon}{label}</dt><dd className="mt-1 text-lg font-semibold text-slate-950">{value}</dd></div>;
}
