import { RobotPosition, RobotVelocity, PathNode } from '../types/robot';

interface VehiclePopupProps {
  robot: {
    name: string;
    ip: string;
    status: string;
    cpu: number;
    memory: number;
    battery: number;
    localizationConfidence: number;
    position: RobotPosition;
    velocity: RobotVelocity;
    deliveryPath: PathNode[];
  };
  x: number;
  y: number;
  onClose: () => void;
}

export function VehiclePopup({ robot, x, y, onClose }: VehiclePopupProps) {
  const getMetricColor = (value: number, type: 'cpu' | 'memory' | 'battery' | 'confidence') => {
    if (type === 'battery') {
      if (value < 20) return 'text-red-600';
      if (value < 50) return 'text-orange-600';
      return 'text-green-600';
    }
    if (type === 'confidence') {
      if (value < 50) return 'text-red-600';
      if (value < 80) return 'text-orange-600';
      return 'text-green-600';
    }
    if (value > 80) return 'text-red-600';
    if (value > 60) return 'text-orange-600';
    return 'text-green-600';
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="absolute z-50 bg-white rounded-xl shadow-2xl border border-slate-200 p-4 w-72"
        style={{ left: x + 16, top: y - 12 }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg text-slate-900 font-medium">{robot.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">
            ×
          </button>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">状态</span>
            <span className={robot.status === 'online' ? 'text-green-600' : 'text-slate-400'}>
              {robot.status === 'online' ? '在线' : robot.status === 'offline' ? '离线' : '异常'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">IP</span>
            <span className="text-slate-900">{robot.ip}</span>
          </div>

          <hr className="border-slate-100" />

          <div className="flex justify-between">
            <span className="text-slate-500">位置 X</span>
            <span className="text-slate-900">{robot.position.x.toFixed(1)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">位置 Y</span>
            <span className="text-slate-900">{robot.position.y.toFixed(1)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">朝向 θ</span>
            <span className="text-slate-900">{robot.position.theta.toFixed(2)} rad</span>
          </div>

          <hr className="border-slate-100" />

          <div className="flex justify-between">
            <span className="text-slate-500">线速度</span>
            <span className="text-slate-900">{robot.velocity.linear.toFixed(2)} m/s</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">角速度</span>
            <span className="text-slate-900">{robot.velocity.angular.toFixed(2)} rad/s</span>
          </div>

          <hr className="border-slate-100" />

          <div className="flex justify-between items-center">
            <span className="text-slate-500">电量</span>
            <span className={`font-medium ${getMetricColor(robot.battery, 'battery')}`}>
              {robot.battery}%
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500">CPU</span>
            <span className={`font-medium ${getMetricColor(robot.cpu, 'cpu')}`}>
              {robot.cpu}%
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500">内存</span>
            <span className={`font-medium ${getMetricColor(robot.memory, 'memory')}`}>
              {robot.memory}%
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500">定位置信度</span>
            <span className={`font-medium ${getMetricColor(robot.localizationConfidence, 'confidence')}`}>
              {robot.localizationConfidence}%
            </span>
          </div>

          {robot.deliveryPath.length > 0 && (
            <>
              <hr className="border-slate-100" />
              <div className="flex justify-between">
                <span className="text-slate-500">配送路径</span>
                <span className="text-slate-900">{robot.deliveryPath.length} 个节点</span>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
