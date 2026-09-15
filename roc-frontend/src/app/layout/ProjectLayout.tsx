import { createContext, useContext, useEffect, useState } from 'react';
import { ChevronRight, Map, Settings, Truck, UserRound } from 'lucide-react';
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { parseProject, type Project } from '../../features/projects/model';
import { apiRequest } from '../../shared/api/client';
import { isAbortError } from '../../shared/api/errors';
import { ErrorState } from '../../shared/ui/ErrorState';

interface ProjectContextValue {
  project: Project;
  refreshProject: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function useCurrentProject(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (!context) throw new Error('useCurrentProject must be used inside ProjectLayout');
  return context;
}

export function ProjectLayout() {
  const { projectId } = useParams();
  const { token, role } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadProject = async (signal?: AbortSignal) => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const payload = await apiRequest<{ project?: unknown }>(`/api/projects/${projectId}`, { token, signal });
      if (!payload.project) throw new Error('服务端未返回项目数据');
      setProject(parseProject(payload.project));
    } catch (requestError) {
      if (!isAbortError(requestError)) setError(requestError instanceof Error ? requestError.message : '无法加载项目');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    setProject(null);
    const controller = new AbortController();
    void loadProject(controller.signal);
    return () => controller.abort();
  }, [projectId, token]);

  if (loading) return <div className="rounded-lg border bg-white p-8 text-center text-slate-500">正在加载项目…</div>;
  if (error) return <ErrorState message={error} onRetry={() => void loadProject()} />;
  if (!project) return <ErrorState message="项目不存在或已被删除" />;

  const base = `/projects/${project.id}`;
  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `flex h-10 items-center gap-2 border-b-2 px-1 text-sm font-medium ${isActive
      ? 'border-blue-600 text-blue-700'
      : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-950'}`;

  return (
    <ProjectContext.Provider value={{ project, refreshProject: () => loadProject() }}>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5 text-sm text-slate-500">
            <Link to="/projects" className="hover:text-blue-700">项目工作台</Link>
            <ChevronRight className="size-4" />
            <span className="truncate">{project.name}</span>
          </div>
          <div className="mt-3 min-w-0">
            <div className="flex flex-wrap items-center gap-3"><h1 className="truncate text-2xl font-semibold leading-8 text-slate-950">{project.name}</h1>{role === 'super_admin' && <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700"><UserRound className="size-3.5" />所属账户：{project.ownerUsername || project.ownerId}</span>}</div>
            <p className="mt-1 line-clamp-2 text-sm text-slate-600">{project.description || '暂无项目描述'}</p>
          </div>
          <nav className="mt-5 flex gap-6 border-b border-slate-200" aria-label="项目导航">
            <NavLink to={`${base}/maps`} className={tabClass}><Map className="size-4" />地图</NavLink>
            <NavLink to={`${base}/vehicles`} className={tabClass}><Truck className="size-4" />车辆</NavLink>
            <NavLink to={`${base}/settings`} className={tabClass}><Settings className="size-4" />设置</NavLink>
          </nav>
        </div>
        <Outlet />
      </div>
    </ProjectContext.Provider>
  );
}
