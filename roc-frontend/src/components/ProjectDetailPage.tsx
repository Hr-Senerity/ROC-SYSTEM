import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth, API_BASE } from '../App';
import { ArrowLeft, Zap, FileText, Map, Activity, CheckCircle } from 'lucide-react';
import { PerformanceMonitor } from './PerformanceMonitor';

type TabType = 'details' | 'maps' | 'performance';

interface MapData {
  id: string;
  name: string;
  image_url: string;
  is_active: boolean;
  created_at: string;
}

interface ProjectData {
  id: string;
  name: string;
  description: string;
  status: string;
  created_at: string;
}

export function ProjectDetailPage() {
  const { isLoggedIn, token } = useAuth();
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [activeTab, setActiveTab] = useState<TabType>('details');
  const [maps, setMaps] = useState<MapData[]>([]);
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn) { navigate('/login'); return; }
    fetchProject();
    fetchMaps();
  }, [projectId]);

  const fetchProject = async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (data.ok) setProjectData(data.project);
    } catch { /* ignore */ }
  };

  const fetchMaps = async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/projects/${projectId}/maps`);
      const data = await resp.json();
      if (data.ok) setMaps(data.maps || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  if (!isLoggedIn) return null;

  const handleMapClick = (id: string) => {
    setMaps(maps.map(m => ({ ...m, is_active: m.id === id })));
    navigate(`/project/${projectId}/map/${id}`);
  };

  const handleMapActivate = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setMaps(maps.map(m => ({ ...m, is_active: m.id === id })));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/projects')}
                className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                返回项目列表
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl text-slate-900">ROC平台</span>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-6">
          <div className="w-64 flex-shrink-0">
            <div className="bg-white rounded-xl shadow-sm p-4 sticky top-24">
              <nav className="space-y-2">
                <button onClick={() => setActiveTab('details')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    activeTab === 'details' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'
                  }`}>
                  <FileText className="w-5 h-5" />
                  <span>项目详情</span>
                </button>
                <button onClick={() => setActiveTab('maps')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    activeTab === 'maps' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'
                  }`}>
                  <Map className="w-5 h-5" />
                  <span>我的地图</span>
                </button>
                <button onClick={() => setActiveTab('performance')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    activeTab === 'performance' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'
                  }`}>
                  <Activity className="w-5 h-5" />
                  <span>性能监控</span>
                </button>
              </nav>
            </div>
          </div>

          <div className="flex-1">
            <div className="bg-white rounded-xl shadow-sm p-6">
              {activeTab === 'details' && (
                <div>
                  <h2 className="text-2xl text-slate-900 mb-6">项目详情</h2>
                  {loading ? <p className="text-slate-400">加载中...</p> : projectData ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-slate-600 mb-1">项目名称</label>
                        <p className="text-slate-900">{projectData.name}</p>
                      </div>
                      <div>
                        <label className="block text-slate-600 mb-1">项目描述</label>
                        <p className="text-slate-900">{projectData.description || '暂无描述'}</p>
                      </div>
                      <div>
                        <label className="block text-slate-600 mb-1">创建时间</label>
                        <p className="text-slate-900">{new Date(projectData.created_at).toLocaleDateString('zh-CN')}</p>
                      </div>
                      <div>
                        <label className="block text-slate-600 mb-1">项目状态</label>
                        <span className="inline-flex items-center px-3 py-1 rounded-full bg-green-100 text-green-700">
                          运行中
                        </span>
                      </div>
                    </div>
                  ) : <p className="text-slate-400">项目不存在</p>}
                </div>
              )}

              {activeTab === 'maps' && (
                <div>
                  <h2 className="text-2xl text-slate-900 mb-6">我的地图</h2>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {maps.map((m) => (
                      <div key={m.id}
                        className={`border-2 rounded-lg p-4 cursor-pointer transition-all relative ${
                          m.is_active
                            ? 'border-blue-500 shadow-lg shadow-blue-200 ring-2 ring-blue-300'
                            : 'border-slate-200 hover:border-blue-400'
                        }`}>
                        {m.is_active && (
                          <div className="absolute top-2 right-2 bg-blue-500 text-white px-2 py-1 rounded-full flex items-center gap-1 z-10">
                            <CheckCircle className="w-3 h-3" />
                            <span className="text-xs">使用中</span>
                          </div>
                        )}
                        <div onClick={() => handleMapClick(m.id)}
                          className="aspect-video bg-slate-100 rounded-lg mb-3 flex items-center justify-center overflow-hidden hover:bg-slate-200 transition-colors relative">
                          {m.image_url ? (
                            <img src={m.image_url} alt={m.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="relative w-full h-full" style={{
                              backgroundImage: 'linear-gradient(rgba(148, 163, 184, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.2) 1px, transparent 1px)',
                              backgroundSize: '20px 20px'
                            }}>
                              <Map className="w-12 h-12 text-slate-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                              <div className="absolute bottom-2 right-2 bg-blue-600 text-white text-xs px-2 py-1 rounded opacity-0 hover:opacity-100 transition-opacity">
                                点击放大
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-slate-900 mb-1">{m.name}</h3>
                            <p className="text-slate-600 text-sm">更新于 {new Date(m.created_at).toLocaleDateString('zh-CN')}</p>
                          </div>
                          <button onClick={(e) => handleMapActivate(e, m.id)}
                            className={`px-3 py-1 rounded-lg text-xs transition-colors ${
                              m.is_active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600'
                            }`}>
                            {m.is_active ? '使用中' : '启用'}
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 flex items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors">
                      <div className="text-center">
                        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-2">
                          <Map className="w-6 h-6 text-slate-400" />
                        </div>
                        <p className="text-slate-600">新建地图</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'performance' && (
                <PerformanceMonitor projectId={projectId || ''} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
