import { useEffect, useMemo, useState } from 'react';
import { Calendar, FolderOpen, MoreHorizontal, Plus, Search, Trash2, UserRound } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../app/auth/AuthProvider';
import { parseProject, parseProjectList, type Project } from '../features/projects/model';
import { apiRequest } from '../shared/api/client';
import { isAbortError } from '../shared/api/errors';
import { EmptyState } from '../shared/ui/EmptyState';
import { ErrorState } from '../shared/ui/ErrorState';
import { PageHeader } from '../shared/ui/PageHeader';
import { StatusBadge } from '../shared/ui/StatusBadge';
import { Button } from './ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from './ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from './ui/alert-dialog';
import { Input } from './ui/input';

export function ProjectsPage() {
  const { token, role } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const query = searchParams.get('q') || '';
  const owner = searchParams.get('owner') || 'all';

  const fetchProjects = async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const payload = await apiRequest('/api/projects', { token, signal });
      setProjects(parseProjectList(payload));
    } catch (requestError) {
      if (!isAbortError(requestError)) setError(requestError instanceof Error ? requestError.message : '无法加载项目');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void fetchProjects(controller.signal);
    return () => controller.abort();
  }, [token]);

  const visibleProjects = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('zh-CN');
    return projects.filter((project) => {
      const matchesOwner = owner === 'all' || project.ownerId === owner;
      const matchesQuery = !normalized || `${project.name} ${project.description} ${project.ownerUsername}`.toLocaleLowerCase('zh-CN').includes(normalized);
      return matchesOwner && matchesQuery;
    });
  }, [owner, projects, query]);
  const owners = useMemo(() => Array.from(new Map(projects.map((project) => [project.ownerId, project.ownerUsername || project.ownerId])).entries()), [projects]);

  const createProject = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    setError('');
    try {
      const payload = await apiRequest<{ project?: unknown }>('/api/projects', {
        method: 'POST', token, body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      if (!payload.project) throw new Error('服务端未返回新项目');
      const project = parseProject(payload.project);
      setProjects((current) => [project, ...current]);
      setName('');
      setDescription('');
      setShowCreate(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '创建项目失败');
    } finally {
      setCreating(false);
    }
  };

  const deleteProject = async () => {
    if (!projectToDelete || deletingId) return;
    setDeletingId(projectToDelete.id);
    setError('');
    try {
      await apiRequest(`/api/projects/${projectToDelete.id}`, { method: 'DELETE', token });
      setProjects((current) => current.filter((item) => item.id !== projectToDelete.id));
      setProjectToDelete(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '删除项目失败');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="项目工作台"
        description={role === 'super_admin' ? `平台共有 ${projects.length} 个项目；管理员可查看全部账户所属项目。` : `共 ${projects.length} 个项目，选择项目后管理地图和机器人。`}
        actions={<Button onClick={() => setShowCreate(true)}><Plus />新建项目</Button>}
      />

      <div className="flex max-w-2xl flex-col gap-3 sm:flex-row">
        <label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            aria-label="搜索项目"
            value={query}
            onChange={(event) => {
              const next = new URLSearchParams(searchParams);
              if (event.target.value) next.set('q', event.target.value);
              else next.delete('q');
              setSearchParams(next, { replace: true });
            }}
            placeholder={role === 'super_admin' ? '搜索项目名称、描述或所属账户' : '搜索项目名称或描述'}
            className="pl-9"
          />
        </label>
        {role === 'super_admin' && <label><span className="sr-only">按所属账户筛选</span><select value={owner} onChange={(event) => { const next = new URLSearchParams(searchParams); if (event.target.value === 'all') next.delete('owner'); else next.set('owner', event.target.value); setSearchParams(next, { replace: true }); }} className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm sm:w-48"><option value="all">全部所属账户</option>{owners.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}
      </div>

      {error && <ErrorState message={error} onRetry={() => void fetchProjects()} />}
      {loading && <div className="rounded-lg border bg-white p-8 text-center text-slate-500">正在加载项目…</div>}

      {!loading && !error && visibleProjects.length === 0 && (
        <EmptyState
          title={projects.length ? '没有符合条件的项目' : '还没有项目'}
          description={projects.length ? '修改搜索内容或清除筛选。' : '创建项目后即可上传地图并接入机器人。'}
          action={projects.length
            ? <Button variant="outline" onClick={() => setSearchParams({}, { replace: true })}>清除筛选</Button>
            : <Button onClick={() => setShowCreate(true)}><Plus />新建项目</Button>}
        />
      )}

      {!loading && visibleProjects.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {visibleProjects.map((project) => (
            <article key={project.id} className="group relative flex min-h-48 flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-10 place-items-center rounded-lg bg-blue-50 text-blue-700"><FolderOpen className="size-5" /></span>
                <details className="relative">
                  <summary className="grid size-9 cursor-pointer list-none place-items-center rounded-md text-slate-500 hover:bg-slate-100" aria-label={`打开 ${project.name} 操作菜单`}>
                    <MoreHorizontal className="size-5" />
                  </summary>
                  <div className="absolute right-0 z-20 mt-1 w-36 rounded-md border bg-white p-1 shadow-lg">
                    <button
                      type="button"
                      disabled={deletingId === project.id}
                      onClick={() => setProjectToDelete(project)}
                      className="flex h-9 w-full items-center gap-2 rounded px-3 text-left text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                    ><Trash2 className="size-4" />{deletingId === project.id ? '删除中…' : '删除项目'}</button>
                  </div>
                </details>
              </div>
              <Link to={`/project/${project.id}`} className="mt-4 text-lg font-semibold text-slate-950 hover:text-blue-700 hover:underline">{project.name}</Link>
              <p className="mt-2 line-clamp-2 flex-1 text-sm text-slate-600">{project.description || '暂无描述'}</p>
              {role === 'super_admin' && <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-indigo-700"><UserRound className="size-3.5" />所属账户：{project.ownerUsername || project.ownerId}</p>}
              <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                <span className="flex items-center gap-1.5 text-xs text-slate-500"><Calendar className="size-3.5" />{new Date(project.updatedAt || project.createdAt).toLocaleDateString('zh-CN')}</span>
                <StatusBadge status={project.status === 'active' ? 'active' : 'inactive'} label={project.status === 'active' ? '启用' : '停用'} />
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建项目</DialogTitle>
            <DialogDescription>创建后进入项目上传地图并注册机器人。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="project-name" className="text-sm font-medium">项目名称</label>
              <Input id="project-name" maxLength={128} value={name} onChange={(event) => setName(event.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <label htmlFor="project-description" className="text-sm font-medium">项目描述</label>
              <textarea id="project-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={4} className="w-full rounded-md border border-input bg-white px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            <Button disabled={!name.trim() || creating} onClick={() => void createProject()}>{creating ? '创建中…' : '创建项目'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(projectToDelete)}
        onOpenChange={(open) => { if (!open && !deletingId) setProjectToDelete(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除项目“{projectToDelete?.name}”？</AlertDialogTitle>
            <AlertDialogDescription>
              项目及其地图关联数据将被删除；仍有地图绑定车辆时服务端可能拒绝删除。此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingId)}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(deletingId)}
              onClick={(event) => { event.preventDefault(); void deleteProject(); }}
              className="bg-red-700 hover:bg-red-800"
            >
              {deletingId ? '删除中…' : '删除项目'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
