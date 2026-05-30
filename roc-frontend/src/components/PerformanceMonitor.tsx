import { useState, useEffect } from 'react';
import { Plus, Trash2, Activity, Circle, ChevronDown, ChevronUp, Server } from 'lucide-react';
import type { Robot, LogEntry } from '../types/robot';
import { useAuth, API_BASE } from '../App';

interface PerformanceMonitorProps {
  projectId: string;
}

export function PerformanceMonitor({ projectId }: PerformanceMonitorProps) {
  const { token } = useAuth();
  const [robots, setRobots] = useState<Robot[]>([]);
  const [loading, setLoading] = useState(true);

  const [expandedRobot, setExpandedRobot] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRobotName, setNewRobotName] = useState('');
  const [newRobotIp, setNewRobotIp] = useState('');

  const fetchVehicles = async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/vehicles`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (data.ok) setRobots(data.vehicles || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchVehicles(); }, []);

  const handleAddRobot = async () => {
    if (!newRobotName.trim() || !newRobotIp.trim()) {
      alert('请填写机器人名称和IP地址');
      return;
    }

    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipPattern.test(newRobotIp)) {
      alert('请输入有效的IP地址');
      return;
    }

    try {
      const resp = await fetch(`${API_BASE}/api/vehicles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newRobotName, ip: newRobotIp, project_id: projectId }),
      });
      const data = await resp.json();
      if (data.ok) {
        setRobots([...robots, data.vehicle]);
        setNewRobotName('');
        setNewRobotIp('');
        setShowAddModal(false);
      } else {
        alert(data.message || '添加失败');
      }
    } catch { alert('网络错误'); }
  };

  const handleDeleteRobot = async (id: string) => {
    if (!window.confirm('确定要删除此机器人吗？')) return;
    try {
      const resp = await fetch(`${API_BASE}/api/vehicles/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (data.ok) {
        setRobots(robots.filter(r => r.id !== id));
        if (expandedRobot === id) setExpandedRobot(null);
      } else {
        alert(data.message || '删除失败');
      }
    } catch { alert('网络错误'); }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'text-green-500';
      case 'offline':
        return 'text-slate-400';
      case 'error':
        return 'text-red-500';
      default:
        return 'text-slate-400';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'online':
        return '在线';
      case 'offline':
        return '离线';
      case 'error':
        return '异常';
      default:
        return '未知';
    }
  };

  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'info':
        return 'text-blue-600 bg-blue-50';
      case 'warning':
        return 'text-orange-600 bg-orange-50';
      case 'error':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-slate-600 bg-slate-50';
    }
  };

  const getMetricColor = (value: number, type: 'cpu' | 'memory' | 'battery' | 'confidence') => {
    if (type === 'battery') {
      if (value < 20) return 'text-red-600';
      if (value < 50) return 'text-orange-600';
      return 'text-green-600';
    } else if (type === 'confidence') {
      if (value < 50) return 'text-red-600';
      if (value < 80) return 'text-orange-600';
      return 'text-green-600';
    } else {
      if (value > 80) return 'text-red-600';
      if (value > 60) return 'text-orange-600';
      return 'text-green-600';
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl text-slate-900">性能监控</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          添加机器人
        </button>
      </div>

      {/* 机器人列表 */}
      <div className="space-y-4">
        {robots.map((robot) => (
          <div key={robot.id} className="border border-slate-200 rounded-lg overflow-hidden">
            {/* 机器人概览 */}
            <div className="p-4 bg-white hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-4">
                {/* 状态指示器 */}
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
                    <Server className="w-6 h-6 text-white" />
                  </div>
                </div>

                {/* 机器人信息 */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg text-slate-900">{robot.name}</h3>
                    <div className="flex items-center gap-1">
                      <Circle className={`w-3 h-3 fill-current ${getStatusColor(robot.status)}`} />
                      <span className={`${getStatusColor(robot.status)}`}>
                        {getStatusText(robot.status)}
                      </span>
                    </div>
                  </div>
                  <p className="text-slate-600">IP: {robot.ip}</p>
                </div>

                {/* 性能指标 */}
                <div className="flex gap-4">
                  <div className="text-center">
                    <div className={`text-2xl mb-1 ${getMetricColor(robot.cpu, 'cpu')}`}>
                      {robot.cpu}%
                    </div>
                    <div className="text-slate-500">CPU</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-2xl mb-1 ${getMetricColor(robot.memory, 'memory')}`}>
                      {robot.memory}%
                    </div>
                    <div className="text-slate-500">内存</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-2xl mb-1 ${getMetricColor(robot.battery, 'battery')}`}>
                      {robot.battery}%
                    </div>
                    <div className="text-slate-500">电量</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-2xl mb-1 ${getMetricColor(robot.localizationConfidence, 'confidence')}`}>
                      {robot.localizationConfidence}%
                    </div>
                    <div className="text-slate-500">定位</div>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setExpandedRobot(expandedRobot === robot.id ? null : robot.id)}
                    className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    {expandedRobot === robot.id ? (
                      <ChevronUp className="w-5 h-5 text-slate-600" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-slate-600" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDeleteRobot(robot.id)}
                    className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-5 h-5 text-red-500" />
                  </button>
                </div>
              </div>
            </div>

            {/* 日志详情（展开时显示） */}
            {expandedRobot === robot.id && (
              <div className="border-t border-slate-200 bg-slate-50 p-4">
                <h4 className="text-slate-900 mb-3 flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  运行日志
                </h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {(robot.logs || []).map((log) => (
                    <div
                      key={log.id}
                      className="bg-white rounded-lg p-3 flex items-start gap-3"
                    >
                      <span
                        className={`px-2 py-1 rounded text-xs uppercase ${getLogLevelColor(
                          log.level
                        )}`}
                      >
                        {log.level}
                      </span>
                      <div className="flex-1">
                        <p className="text-slate-900">{log.message}</p>
                        <p className="text-slate-500 mt-1">{log.timestamp}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {robots.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <Server className="w-16 h-16 mx-auto mb-4 text-slate-300" />
            <p>暂无机器人，点击"添加机器人"开始</p>
          </div>
        )}
      </div>

      {/* 添加机器人弹窗 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-2xl text-slate-900 mb-6">添加机器人</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-slate-700 mb-2">机器人名称</label>
                <input
                  type="text"
                  value={newRobotName}
                  onChange={(e) => setNewRobotName(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="例如: 机器人-04"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-2">IP地址</label>
                <input
                  type="text"
                  value={newRobotIp}
                  onChange={(e) => setNewRobotIp(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="例如: 192.168.1.104"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewRobotName('');
                  setNewRobotIp('');
                }}
                className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleAddRobot}
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}