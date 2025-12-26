import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../App';
import { ArrowLeft, Zap, FileText, Map, Route, Activity, CheckCircle } from 'lucide-react';
import { PerformanceMonitor } from './PerformanceMonitor';

type TabType = 'details' | 'maps' | 'paths' | 'performance';

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

  // 模拟项目数据
  const projectData = {
    id: projectId,
    name: '智能配送项目',
    description: '自动化配送机器人管理系统',
    createdAt: '2024-12-01',
    status: 'active',
  };

  const handleMapClick = (id: number) => {
    setMaps(maps.map(map => ({ ...map, isActive: map.id === id })));
  };

  const activeMap = maps.find(map => map.isActive);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* 顶部导航栏 */}
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
          {/* 左侧导航栏 */}
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
                  onClick={() => setActiveTab('paths')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    activeTab === 'paths'
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Route className="w-5 h-5" />
                  <span>我的路径</span>
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

          {/* 右侧内容区 */}
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
                        onClick={() => handleMapClick(map.id)}
                        className={`border-2 rounded-lg p-4 cursor-pointer transition-all relative ${
                          map.isActive
                            ? 'border-blue-500 shadow-lg shadow-blue-200 ring-2 ring-blue-300'
                            : 'border-slate-200 hover:border-blue-400'
                        }`}
                      >
                        {map.isActive && (
                          <div className="absolute top-2 right-2 bg-blue-500 text-white px-2 py-1 rounded-full flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            <span className="text-xs">使用中</span>
                          </div>
                        )}
                        <div className="aspect-video bg-slate-100 rounded-lg mb-3 flex items-center justify-center overflow-hidden">
                          {/* 模拟地图网格 */}
                          <div className="relative w-full h-full" style={{ 
                            backgroundImage: 'linear-gradient(rgba(148, 163, 184, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.2) 1px, transparent 1px)',
                            backgroundSize: '20px 20px'
                          }}>
                            <Map className="w-12 h-12 text-slate-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                          </div>
                        </div>
                        <h3 className="text-slate-900 mb-1">{map.name}</h3>
                        <p className="text-slate-600">更新于 {map.updatedAt}</p>
                      </div>
                    ))}
                    
                    {/* 新建地图 */}
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

              {activeTab === 'paths' && (
                <div>
                  <h2 className="text-2xl text-slate-900 mb-6">我的路径</h2>
                  <div className="grid lg:grid-cols-2 gap-6">
                    {[
                      { id: 1, name: '配送路径 1', nodes: [1, 5, 8, 12], color: 'blue' },
                      { id: 2, name: '配送路径 2', nodes: [2, 6, 15, 18], color: 'purple' },
                      { id: 3, name: '配送路径 3', nodes: [3, 7, 20, 23], color: 'green' },
                      { id: 4, name: '配送路径 4', nodes: [4, 9, 14, 22], color: 'orange' },
                    ].map((path) => (
                      <div
                        key={path.id}
                        className="border border-slate-200 rounded-lg overflow-hidden hover:border-blue-500 transition-colors cursor-pointer"
                      >
                        <div className="p-4 border-b border-slate-200 bg-slate-50">
                          <h3 className="text-slate-900 mb-1">{path.name}</h3>
                          <p className="text-slate-600">路径节点: {path.nodes.join(' → ')}</p>
                        </div>
                        
                        {/* 地图底图 + 路径叠加 */}
                        <div className="aspect-square bg-slate-100 relative overflow-hidden">
                          {/* 网格底图 */}
                          <div 
                            className="absolute inset-0" 
                            style={{ 
                              backgroundImage: 'linear-gradient(rgba(148, 163, 184, 0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.15) 1px, transparent 1px)',
                              backgroundSize: '15px 15px'
                            }}
                          />
                          
                          {/* 地图区域 */}
                          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 300">
                            {/* 路径线条 */}
                            <path
                              d={`M ${50 + path.id * 10} 50 L 100 ${80 + path.id * 15} L ${150 + path.id * 10} 120 L 200 ${150 + path.id * 20} L 250 200`}
                              stroke={path.color === 'blue' ? '#3b82f6' : path.color === 'purple' ? '#a855f7' : path.color === 'green' ? '#10b981' : '#f97316'}
                              strokeWidth="3"
                              fill="none"
                              strokeDasharray="5,5"
                              opacity="0.8"
                            />
                            
                            {/* 路径节点 */}
                            {path.nodes.map((node, idx) => {
                              const positions = [
                                { x: 50 + path.id * 10, y: 50 },
                                { x: 100, y: 80 + path.id * 15 },
                                { x: 150 + path.id * 10, y: 120 },
                                { x: 200, y: 150 + path.id * 20 },
                              ];
                              const pos = positions[idx] || positions[0];
                              
                              return (
                                <g key={node}>
                                  <circle
                                    cx={pos.x}
                                    cy={pos.y}
                                    r="8"
                                    fill={path.color === 'blue' ? '#3b82f6' : path.color === 'purple' ? '#a855f7' : path.color === 'green' ? '#10b981' : '#f97316'}
                                    stroke="white"
                                    strokeWidth="2"
                                  />
                                  <text
                                    x={pos.x}
                                    y={pos.y + 4}
                                    textAnchor="middle"
                                    fill="white"
                                    fontSize="10"
                                    fontWeight="bold"
                                  >
                                    {node}
                                  </text>
                                </g>
                              );
                            })}
                            
                            {/* 方向箭头 */}
                            <defs>
                              <marker
                                id={`arrow-${path.id}`}
                                markerWidth="10"
                                markerHeight="10"
                                refX="5"
                                refY="3"
                                orient="auto"
                                markerUnits="strokeWidth"
                              >
                                <path
                                  d="M0,0 L0,6 L9,3 z"
                                  fill={path.color === 'blue' ? '#3b82f6' : path.color === 'purple' ? '#a855f7' : path.color === 'green' ? '#10b981' : '#f97316'}
                                />
                              </marker>
                            </defs>
                            <path
                              d={`M ${50 + path.id * 10} 50 L 100 ${80 + path.id * 15} L ${150 + path.id * 10} 120 L 200 ${150 + path.id * 20} L 250 200`}
                              stroke="transparent"
                              strokeWidth="3"
                              fill="none"
                              markerMid={`url(#arrow-${path.id})`}
                            />
                          </svg>
                        </div>
                      </div>
                    ))}
                    
                    {/* 新建路径 */}
                    <div className="border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors min-h-[200px]">
                      <div className="text-center">
                        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-2">
                          <Route className="w-6 h-6 text-slate-400" />
                        </div>
                        <p className="text-slate-600">+ 新建路径</p>
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