import { useState } from 'react';
import { Plus, Trash2, Activity, Circle, ChevronDown, ChevronUp, Server } from 'lucide-react';
import type { Robot, LogEntry } from '../types/robot';

interface PerformanceMonitorProps {
  projectId: string;
}

export function PerformanceMonitor({ projectId }: PerformanceMonitorProps) {
  const [robots, setRobots] = useState<Robot[]>([
    {
      id: '1',
      name: '机器人-01',
      ip: '192.168.1.101',
      status: 'online',
      cpu: 45,
      memory: 62,
      battery: 85,
      localizationConfidence: 95,
      position: { x: 25, y: 35, theta: 0.78 },
      velocity: { linear: 1.2, angular: 0.05 },
      deliveryPath: [],
      logs: [
        { id: '1', timestamp: '2024-12-26 10:30:15', level: 'info', message: '任务开始执行' },
        { id: '2', timestamp: '2024-12-26 10:31:20', level: 'info', message: '导航路径规划完成' },
        { id: '3', timestamp: '2024-12-26 10:32:05', level: 'warning', message: '检测到障碍物，重新规划路径' },
      ],
    },
    {
      id: '2',
      name: '机器人-02',
      ip: '192.168.1.102',
      status: 'online',
      cpu: 32,
      memory: 58,
      battery: 92,
      localizationConfidence: 88,
      position: { x: 70, y: 60, theta: 2.35 },
      velocity: { linear: 0.8, angular: -0.1 },
      deliveryPath: [],
      logs: [
        { id: '1', timestamp: '2024-12-26 10:25:10', level: 'info', message: '系统启动成功' },
        { id: '2', timestamp: '2024-12-26 10:26:30', level: 'info', message: '接收到新任务' },
      ],
    },
    {
      id: '3',
      name: '机器人-03',
      ip: '192.168.1.103',
      status: 'error',
      cpu: 78,
      memory: 85,
      battery: 15,
      localizationConfidence: 45,
      position: { x: 40, y: 85, theta: 1.57 },
      velocity: { linear: 0, angular: 0 },
      deliveryPath: [],
      logs: [
        { id: '1', timestamp: '2024-12-26 10:20:00', level: 'error', message: '电池电量过低' },
        { id: '2', timestamp: '2024-12-26 10:21:15', level: 'error', message: '传感器异常' },
        { id: '3', timestamp: '2024-12-26 10:22:30', level: 'warning', message: '尝试返回充电站' },
      ],
    },
  ]);

  const [expandedRobot, setExpandedRobot] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRobotName, setNewRobotName] = useState('');
  const [newRobotIp, setNewRobotIp] = useState('');

  const handleAddRobot = () => {
    if (!newRobotName.trim() || !newRobotIp.trim()) {
      alert('请填写机器人名称和IP地址');
      return;
    }

    // 简单的IP格式验证
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipPattern.test(newRobotIp)) {
      alert('请输入有效的IP地址');
      return;
    }

    const newRobot: Robot = {
      id: Date.now().toString(),
      name: newRobotName,
      ip: newRobotIp,
      status: 'offline',
      cpu: 0,
      memory: 0,
      battery: 100,
      localizationConfidence: 0,
      position: { x: 0, y: 0, theta: 0 },
      velocity: { linear: 0, angular: 0 },
      deliveryPath: [],
      logs: [
        {
          id: '1',
          timestamp: new Date().toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          level: 'info',
          message: '机器人已添加，等待连接',
        },
      ],
    };

    setRobots([...robots, newRobot]);
    setNewRobotName('');
    setNewRobotIp('');
    setShowAddModal(false);
  };

  const handleDeleteRobot = (id: string) => {
    if (window.confirm('确定要删除此机器人吗？')) {
      setRobots(robots.filter((r) => r.id !== id));
      if (expandedRobot === id) {
        setExpandedRobot(null);
      }
    }
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
                  {robot.logs.map((log) => (
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