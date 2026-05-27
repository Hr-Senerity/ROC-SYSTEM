import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../App';
import { ArrowLeft, Zap, FileText, Map, Activity, CheckCircle } from 'lucide-react';
import { PerformanceMonitor } from './PerformanceMonitor';

type TabType = 'details' | 'maps' | 'performance';

interface MapData {
  id: number;
  name: string;
  updatedAt: string;
  isActive: boolean;
}

export function ProjectDetailPage() {
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [activeTab, setActiveTab] = useState<TabType>('details');
  const [maps, setMaps] = useState<MapData[]>([
    { id: 1, name: '地图 1', updatedAt: '2024-12-21', isActive: false },
    { id: 2, name: '地图 2', updatedAt: '2024-12-22', isActive: true },
    { id: 3, name: '地图 3', updatedAt: '2024-12-23', isActive: false },
  ]);

  if (!isLoggedIn) {
    navigate('/login');
    return null;
  }

  const projectData = {
    id: projectId,
    name: '智能配送项目',
    description: '自动化配送机器人管理系统',
    createdAt: '2024-12-01',
    status: 'active',
  };

  const handleMapClick = (id: number) => {
    setMaps(maps.map(map => ({ ...map, isActive: map.id === id })));
    navigate(`/project/${projectId}/map/${id}`);
  };

  const handleMapActivate = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    setMaps(maps.map(map => ({ ...map, isActive: map.id === id })));
  };

  const activeMap = maps.find(map => map.isActive);

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
          {/* Left sidebar — 3 tabs only */}
          <div className="w-64 flex-shrink-0">
            <div className="bg-white rounded-xl shadow-sm p-4 sticky top-24">
              <nav className="space-y-2">
                <button
                  onClick={() => setActiveTab('details')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    activeTab === 'details'
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <FileText className="w-5 h-5" />
                  <span>项目详情</span>
                </button>

                <button
                  onClick={() => setActiveTab('maps')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    activeTab === 'maps'
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Map className="w-5 h-5" />
                  <span>我的地图</span>
                </button>

                <button
                  onClick={() => setActiveTab('performance')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    activeTab === 'performance'
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Activity className="w-5 h-5" />
                  <span>性能监控</span>
                </button>
              </nav>
            </div>
          </div>

          {/* Right content */}
          <div className="flex-1">
            <div className="bg-white rounded-xl shadow-sm p-6">
              {activeTab === 'details' && (
                <div>
                  <h2 className="text-2xl text-slate-900 mb-6">项目详情</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-slate-600 mb-1">项目名称</label>
                      <p className="text-slate-900">{projectData.name}</p>
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">项目描述</label>
                      <p className="text-slate-900">{projectData.description}</p>
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">创建时间</label>
                      <p className="text-slate-900">{projectData.createdAt}</p>
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">项目状态</label>
                      <span className="inline-flex items-center px-3 py-1 rounded-full bg-green-100 text-green-700">
                        运行中
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'maps' && (
                <div>
                  <h2 className="text-2xl text-slate-900 mb-6">我的地图</h2>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {maps.map((map) => (
                      <div
                        key={map.id}
                        className={`border-2 rounded-lg p-4 cursor-pointer transition-all relative ${
                          map.isActive
                            ? 'border-blue-500 shadow-lg shadow-blue-200 ring-2 ring-blue-300'
                            : 'border-slate-200 hover:border-blue-400'
                        }`}
                      >
                        {map.isActive && (
                          <div className="absolute top-2 right-2 bg-blue-500 text-white px-2 py-1 rounded-full flex items-center gap-1 z-10">
                            <CheckCircle className="w-3 h-3" />
                            <span className="text-xs">使用中</span>
                          </div>
                        )}
                        <div
                          onClick={() => handleMapClick(map.id)}
                          className="aspect-video bg-slate-100 rounded-lg mb-3 flex items-center justify-center overflow-hidden hover:bg-slate-200 transition-colors relative"
                        >
                          <div className="relative w-full h-full" style={{
                            backgroundImage: 'linear-gradient(rgba(148, 163, 184, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.2) 1px, transparent 1px)',
                            backgroundSize: '20px 20px'
                          }}>
                            <Map className="w-12 h-12 text-slate-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                            <div className="absolute bottom-2 right-2 bg-blue-600 text-white text-xs px-2 py-1 rounded opacity-0 hover:opacity-100 transition-opacity">
                              点击放大
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-slate-900 mb-1">{map.name}</h3>
                            <p className="text-slate-600 text-sm">更新于 {map.updatedAt}</p>
                          </div>
                          <button
                            onClick={(e) => handleMapActivate(e, map.id)}
                            className={`px-3 py-1 rounded-lg text-xs transition-colors ${
                              map.isActive
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600'
                            }`}
                          >
                            {map.isActive ? '使用中' : '启用'}
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
