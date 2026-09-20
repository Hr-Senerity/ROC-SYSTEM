import { useEffect, useState } from 'react';
import { CheckCircle2, Edit3, Map as MapIcon, MoreHorizontal, Plus, Rocket, Star, Trash2 } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../app/auth/AuthProvider';
import { parseProjectMapList, type ProjectMap } from '../features/maps/model';
import { useAuthenticatedMapImage } from '../features/maps/useAuthenticatedMapImage';
import { apiRequest } from '../shared/api/client';
import { isAbortError } from '../shared/api/errors';
import { EmptyState } from '../shared/ui/EmptyState';
import { ErrorState } from '../shared/ui/ErrorState';
import { PageHeader } from '../shared/ui/PageHeader';
import { Button } from './ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from './ui/alert-dialog';
import { MapUploadModal } from './MapUploadModal';
import { MapArtifactDeployDialog } from './MapArtifactDeployDialog';

export function ProjectDetailPage() {
  const { projectId } = useParams();
  const [searchParams] = useSearchParams();
  const { token } = useAuth();
  const [maps, setMaps] = useState<ProjectMap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [mapToDelete, setMapToDelete] = useState<ProjectMap | null>(null);
  const [mapToDeploy, setMapToDeploy] = useState<ProjectMap | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);

  const loadMaps = async (signal?: AbortSignal) => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const payload = await apiRequest(`/api/projects/${projectId}/maps`, { token, signal });
      setMaps(parseProjectMapList(payload));
    } catch (requestError) {
      if (!isAbortError(requestError)) setError(requestError instanceof Error ? requestError.message : '无法加载地图');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    setMaps([]);
    const controller = new AbortController();
    void loadMaps(controller.signal);
    return () => controller.abort();
  }, [projectId, token]);

  useEffect(() => {
    if (!searchParams.get('mapDeployment') || mapToDeploy) return;
    const mapId = searchParams.get('mapDeploymentMap');
    const matchingMap = maps.find((map) => map.id === mapId);
    if (matchingMap) setMapToDeploy(matchingMap);
  }, [mapToDeploy, maps, searchParams]);

  const deleteMap = async () => {
    if (!projectId || !mapToDelete || deleting) return;
    setDeleting(true);
    setError('');
    try {
      await apiRequest(`/api/projects/${projectId}/maps/${mapToDelete.id}`, { method: 'DELETE', token });
      setMaps((current) => current.filter((map) => map.id !== mapToDelete.id));
      setMapToDelete(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '删除地图失败');
    } finally {
      setDeleting(false);
    }
  };

  const setDefaultMap = async (map: ProjectMap) => {
    if (!projectId || settingDefaultId) return;
    setSettingDefaultId(map.id);
    setError('');
    try {
      await apiRequest(`/api/projects/${projectId}/default-map`, {
        method: 'PUT',
        token,
        body: JSON.stringify({ map_id: map.id }),
      });
      setMaps((current) => current.map((item) => ({ ...item, isDefault: item.id === map.id })));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '设置默认地图失败');
    } finally {
      setSettingDefaultId(null);
    }
  };

  return (
    <section className="space-y-5">
      <PageHeader
        title="地图"
        description="管理项目地图并进入实时监控。默认地图仅影响控制台的默认展示。"
        actions={<Button onClick={() => setShowUpload(true)}><Plus />上传地图</Button>}
      />
      {error && <ErrorState message={error} onRetry={() => void loadMaps()} />}
      {loading && <div className="rounded-lg border bg-white p-8 text-center text-slate-500">正在加载地图…</div>}
      {!loading && !error && maps.length === 0 && (
        <EmptyState title="还没有地图" description="上传第一张地图后即可配置路网并查看车辆位置。" action={<Button onClick={() => setShowUpload(true)}><Plus />上传地图</Button>} />
      )}
      {!loading && maps.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {maps.map((map) => (
            <article key={map.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <Link to={`/projects/${projectId}/maps/${map.id}/monitor`} className="relative block aspect-video bg-slate-100">
                <MapThumbnail map={map} projectId={projectId} token={token} />
                {map.isDefault && <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-1 text-xs font-medium text-white"><CheckCircle2 className="size-3.5" />默认地图</span>}
              </Link>
              <div className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <Link to={`/projects/${projectId}/maps/${map.id}/monitor`} className="block truncate font-semibold text-slate-950 hover:text-blue-700 hover:underline">{map.name}</Link>
                  <p className="mt-1 text-xs text-slate-500">上传于 {new Date(map.createdAt).toLocaleDateString('zh-CN')}</p>
                </div>
                <details className="relative shrink-0">
                  <summary aria-label={`打开 ${map.name} 操作菜单`} className="grid size-8 cursor-pointer list-none place-items-center rounded-md text-slate-500 hover:bg-slate-100"><MoreHorizontal className="size-4" /></summary>
                  <div className="absolute right-0 z-20 mt-1 w-36 rounded-md border bg-white p-1 shadow-lg">
                    <Link to={`/projects/${projectId}/maps/${map.id}/edit`} className="flex h-9 w-full items-center gap-2 rounded px-3 text-sm text-slate-700 hover:bg-slate-50"><Edit3 className="size-4" />编辑路网</Link>
                    <button type="button" onClick={() => setMapToDeploy(map)} className="flex h-9 w-full items-center gap-2 rounded px-3 text-sm text-slate-700 hover:bg-slate-50"><Rocket className="size-4" />下发地图</button>
                    {!map.isDefault && <button type="button" disabled={Boolean(settingDefaultId)} onClick={() => void setDefaultMap(map)} className="flex h-9 w-full items-center gap-2 rounded px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Star className="size-4" />{settingDefaultId === map.id ? '设置中…' : '设为默认'}</button>}
                    <button type="button" onClick={() => setMapToDelete(map)} className="flex h-9 w-full items-center gap-2 rounded px-3 text-sm text-red-700 hover:bg-red-50"><Trash2 className="size-4" />删除地图</button>
                  </div>
                </details>
              </div>
            </article>
          ))}
        </div>
      )}

      {showUpload && <MapUploadModal projectId={projectId || ''} token={token || ''} onClose={() => setShowUpload(false)} onUploaded={() => void loadMaps()} />}
      {mapToDeploy && <MapArtifactDeployDialog projectId={projectId || ''} map={mapToDeploy} token={token} open onClose={() => setMapToDeploy(null)} />}

      <AlertDialog open={Boolean(mapToDelete)} onOpenChange={(open) => { if (!open && !deleting) setMapToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除地图“{mapToDelete?.name}”？</AlertDialogTitle>
            <AlertDialogDescription>地图记录和上传文件将被删除。若车辆已绑定该地图，服务端会拒绝删除并提示先解除绑定。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} onClick={(event) => { event.preventDefault(); void deleteMap(); }} className="bg-red-700 hover:bg-red-800">{deleting ? '删除中…' : '删除地图'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function MapThumbnail({
  map,
  projectId,
  token,
}: {
  map: ProjectMap;
  projectId: string | undefined;
  token: string | null;
}) {
  const image = useAuthenticatedMapImage(projectId, map.id, token, Boolean(map.imageUrl));
  if (image.src) {
    return <img src={image.src} alt={`${map.name} 缩略图`} className="h-full w-full object-contain" />;
  }
  if (image.loading) {
    return <span className="grid h-full place-items-center text-sm text-slate-400">正在加载缩略图…</span>;
  }
  return (
    <span className="grid h-full place-items-center text-slate-400" title={image.error || undefined}>
      <MapIcon className="size-10" aria-hidden="true" />
      <span className="sr-only">{image.error || '未上传地图图片'}</span>
    </span>
  );
}
