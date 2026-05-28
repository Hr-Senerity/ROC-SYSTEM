import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth, API_BASE } from '../App';
import { ArrowLeft, Zap, Maximize2, Minimize2 } from 'lucide-react';
import { VehiclePopup } from './VehiclePopup';
import type { Robot, PathNode } from '../types/robot';

// Road network — displayed on top of the user-uploaded map
const ROAD_NETWORK: { from: PathNode; to: PathNode }[] = [
  { from: { x: 0, y: 50 }, to: { x: 100, y: 50 } },
  { from: { x: 50, y: 0 }, to: { x: 50, y: 100 } },
  { from: { x: 10, y: 20 }, to: { x: 90, y: 20 } },
  { from: { x: 10, y: 80 }, to: { x: 90, y: 80 } },
  { from: { x: 20, y: 10 }, to: { x: 20, y: 90 } },
  { from: { x: 80, y: 10 }, to: { x: 80, y: 90 } },
  { from: { x: 10, y: 20 }, to: { x: 50, y: 50 } },
  { from: { x: 90, y: 20 }, to: { x: 50, y: 50 } },
  { from: { x: 10, y: 80 }, to: { x: 50, y: 50 } },
  { from: { x: 90, y: 80 }, to: { x: 50, y: 50 } },
];

// Mock online vehicles with position data
function getMockVehicles(): Robot[] {
  return [
    {
      id: '1', name: '机器人-01', ip: '192.168.1.101', status: 'online',
      cpu: 45, memory: 62, battery: 85, localizationConfidence: 95,
      position: { x: 25, y: 35, theta: 0.78 },
      velocity: { linear: 1.2, angular: 0.05 },
      deliveryPath: [
        { x: 25, y: 35 }, { x: 50, y: 50 }, { x: 80, y: 20 }, { x: 90, y: 80 },
      ],
      logs: [],
    },
    {
      id: '2', name: '机器人-02', ip: '192.168.1.102', status: 'online',
      cpu: 32, memory: 58, battery: 92, localizationConfidence: 88,
      position: { x: 70, y: 60, theta: 2.35 },
      velocity: { linear: 0.8, angular: -0.1 },
      deliveryPath: [
        { x: 70, y: 60 }, { x: 50, y: 50 }, { x: 20, y: 80 }, { x: 10, y: 20 },
      ],
      logs: [],
    },
    {
      id: '3', name: '机器人-03', ip: '192.168.1.103', status: 'error',
      cpu: 78, memory: 85, battery: 15, localizationConfidence: 45,
      position: { x: 40, y: 85, theta: 1.57 },
      velocity: { linear: 0, angular: 0 },
      deliveryPath: [],
      logs: [],
    },
    {
      id: '4', name: '机器人-04', ip: '192.168.1.104', status: 'online',
      cpu: 55, memory: 70, battery: 60, localizationConfidence: 72,
      position: { x: 85, y: 15, theta: -0.52 },
      velocity: { linear: 1.5, angular: 0.2 },
      deliveryPath: [
        { x: 85, y: 15 }, { x: 50, y: 50 }, { x: 20, y: 20 },
      ],
      logs: [],
    },
  ];
}

// Coordinate mapping: domain 0-100 → pixel range
function mapCoord(coord: number, canvasSize: number): number {
  return (coord / 100) * canvasSize;
}

export function MapDetailPage() {
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const { projectId, mapId } = useParams();

  const [robots, setRobots] = useState<Robot[]>(getMockVehicles);
  const [selectedRobot, setSelectedRobot] = useState<Robot | null>(null);

  // WebSocket real-time updates
  useEffect(() => {
    const wsScheme = API_BASE ? API_BASE.replace(/^http/, 'ws') : 'ws://' + window.location.host;
    const wsUrl = wsScheme + '/ws/status';
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'status_update') {
              setRobots(prev => prev.map(r => {
                if (r.id === data.robot_id || r.name === data.robot_id || r.ip === data.robot_id) {
                  return {
                    ...r,
                    status: data.online ? 'online' : 'offline',
                    cpu: data.cpu ?? r.cpu,
                    memory: data.memory ?? r.memory,
                    battery: data.battery ?? r.battery,
                    localizationConfidence: data.localization_confidence ?? r.localizationConfidence,
                    position: {
                      x: data.position_x ?? r.position.x,
                      y: data.position_y ?? r.position.y,
                      theta: data.position_theta ?? r.position.theta,
                    },
                    velocity: {
                      linear: data.velocity_linear ?? r.velocity.linear,
                      angular: data.velocity_angular ?? r.velocity.angular,
                    },
                  };
                }
                return r;
              }));
            }
          } catch { /* ignore malformed messages */ }
        };
        ws.onclose = () => { reconnectTimer = setTimeout(connect, 5000); };
        ws.onerror = () => { ws?.close(); };
      } catch { reconnectTimer = setTimeout(connect, 5000); }
    };

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panStartPan = useRef({ x: 0, y: 0 });

  const canvasSize = 700;
  const mapMargin = 30; // margin inside canvas for the uploaded map area

  const onlineVehicles = robots.filter(r => r.status === 'online');

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(z => Math.max(0.5, Math.min(3, z + delta)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY };
      panStartPan.current = { ...pan };
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan({ x: panStartPan.current.x + dx, y: panStartPan.current.y + dy });
    }
  }, [isPanning]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleVehicleClick = (robot: Robot, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedRobot(prev => prev?.id === robot.id ? null : robot);
    setPopupPos({ x: e.clientX, y: e.clientY });
  };

  const handleMapClick = () => {
    setSelectedRobot(null);
  };

  const handleZoomIn = () => setZoom(z => Math.min(3, z + 0.2));
  const handleZoomOut = () => setZoom(z => Math.max(0.5, z - 0.2));
  const handleReset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  if (!isLoggedIn) {
    navigate('/login');
    return null;
  }

  const containerClass = isFullscreen
    ? 'fixed inset-0 z-50 bg-white'
    : 'min-h-screen bg-gradient-to-br from-slate-100 to-slate-200';

  return (
    <div className={containerClass}>
      {/* Top bar */}
      <nav className="bg-white shadow-sm border-b border-slate-200 px-4 py-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(`/project/${projectId}`)}
              className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              返回项目
            </button>
            <div className="text-slate-500 text-sm">
              地图 {mapId} | 在线车辆: {onlineVehicles.length}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={handleZoomOut} className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-sm">
              −
            </button>
            <span className="text-slate-600 text-sm w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={handleZoomIn} className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-sm">
              +
            </button>
            <button onClick={handleReset} className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-sm">
              重置
            </button>
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <div className="flex items-center gap-2 ml-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Map canvas */}
      <div
        className="flex items-center justify-center p-4"
        style={{ height: isFullscreen ? 'calc(100vh - 60px)' : 'calc(100vh - 120px)' }}
      >
        <div
          className="relative rounded-xl overflow-hidden shadow-lg border border-slate-300 cursor-grab bg-white"
          style={{ width: canvasSize, height: canvasSize }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={handleMapClick}
        >
          {/* Transformed layer */}
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              width: canvasSize,
              height: canvasSize,
            }}
          >
            <svg width={canvasSize} height={canvasSize} viewBox={`0 0 ${canvasSize} ${canvasSize}`}>
              <defs>
                {/* Grid patterns */}
                <pattern id="majorGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#cbd5e1" strokeWidth="0.8" />
                </pattern>
                <pattern id="minorGrid" width="10" height="10" patternUnits="userSpaceOnUse">
                  <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#e2e8f0" strokeWidth="0.3" />
                </pattern>
                {/* Arrow marker for delivery path */}
                <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="#f59e0b" />
                </marker>
              </defs>

              {/* Layer 1: Gray grid background (full canvas) */}
              <rect width={canvasSize} height={canvasSize} fill="#f8fafc" />
              <rect width={canvasSize} height={canvasSize} fill="url(#minorGrid)" />
              <rect width={canvasSize} height={canvasSize} fill="url(#majorGrid)" />

              {/* Layer 2: User-uploaded map image area */}
              <rect
                x={mapMargin} y={mapMargin}
                width={canvasSize - mapMargin * 2}
                height={canvasSize - mapMargin * 2}
                fill="#f1f5f9"
                stroke="#94a3b8"
                strokeWidth="2"
                rx="4"
              />
              {/* Simulated map features (buildings/obstacles) */}
              <rect x={mapMargin + 40} y={mapMargin + 30} width="50" height="40" fill="#cbd5e1" rx="2" opacity="0.7" />
              <rect x={mapMargin + 150} y={mapMargin + 60} width="60" height="30" fill="#cbd5e1" rx="2" opacity="0.7" />
              <rect x={mapMargin + 300} y={mapMargin + 40} width="40" height="55" fill="#cbd5e1" rx="2" opacity="0.7" />
              <rect x={mapMargin + 400} y={mapMargin + 100} width="70" height="35" fill="#cbd5e1" rx="2" opacity="0.7" />
              <rect x={mapMargin + 100} y={mapMargin + 200} width="45" height="60" fill="#cbd5e1" rx="2" opacity="0.7" />
              <rect x={mapMargin + 350} y={mapMargin + 250} width="55" height="40" fill="#cbd5e1" rx="2" opacity="0.7" />
              <rect x={mapMargin + 500} y={mapMargin + 180} width="35" height="50" fill="#cbd5e1" rx="2" opacity="0.7" />
              {/* Map label */}
              <text x={canvasSize / 2} y={mapMargin + 18}
                textAnchor="middle" fill="#94a3b8" fontSize="12">
                用户上传地图区域
              </text>

              {/* Layer 3: Road network (on top of map) */}
              {ROAD_NETWORK.map((seg, idx) => {
                const x1 = mapCoord(seg.from.x, canvasSize);
                const y1 = mapCoord(seg.from.y, canvasSize);
                const x2 = mapCoord(seg.to.x, canvasSize);
                const y2 = mapCoord(seg.to.y, canvasSize);
                return (
                  <line
                    key={`road-${idx}`}
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="#64748b"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    opacity="0.8"
                  />
                );
              })}

              {/* Road intersection nodes */}
              {(() => {
                const nodes = new Set<string>();
                ROAD_NETWORK.forEach(seg => {
                  nodes.add(`${seg.from.x},${seg.from.y}`);
                  nodes.add(`${seg.to.x},${seg.to.y}`);
                });
                return Array.from(nodes).map(key => {
                  const [sx, sy] = key.split(',').map(Number);
                  return (
                    <circle
                      key={`node-${key}`}
                      cx={mapCoord(sx, canvasSize)}
                      cy={mapCoord(sy, canvasSize)}
                      r="3"
                      fill="#475569"
                    />
                  );
                });
              })()}

              {/* Layer 4: Selected robot delivery path (highlighted) */}
              {selectedRobot && selectedRobot.deliveryPath.length > 1 && (
                <>
                  {selectedRobot.deliveryPath.map((node, idx) => {
                    if (idx === selectedRobot.deliveryPath.length - 1) return null;
                    const next = selectedRobot.deliveryPath[idx + 1];
                    const x1 = mapCoord(node.x, canvasSize);
                    const y1 = mapCoord(node.y, canvasSize);
                    const x2 = mapCoord(next.x, canvasSize);
                    const y2 = mapCoord(next.y, canvasSize);
                    return (
                      <g key={`path-${idx}`}>
                        <line x1={x1} y1={y1} x2={x2} y2={y2}
                          stroke="#f59e0b" strokeWidth="3.5" strokeLinecap="round"
                          markerEnd="url(#arrowhead)" />
                        <circle cx={x1} cy={y1} r="6" fill="#f59e0b" stroke="white" strokeWidth="2" />
                      </g>
                    );
                  })}
                  {(() => {
                    const last = selectedRobot.deliveryPath[selectedRobot.deliveryPath.length - 1];
                    return (
                      <circle
                        cx={mapCoord(last.x, canvasSize)}
                        cy={mapCoord(last.y, canvasSize)}
                        r="6" fill="#f59e0b" stroke="white" strokeWidth="2"
                      />
                    );
                  })()}
                </>
              )}

              {/* Layer 5: Vehicle markers (online only, topmost) */}
              {onlineVehicles.map(robot => {
                const cx = mapCoord(robot.position.x, canvasSize);
                const cy = mapCoord(robot.position.y, canvasSize);
                const isSelected = selectedRobot?.id === robot.id;
                const angleRad = robot.position.theta;
                const arrowLen = 14;
                const ax = cx + Math.cos(angleRad) * arrowLen;
                const ay = cy + Math.sin(angleRad) * arrowLen;

                return (
                  <g
                    key={robot.id}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      const svgEl = (e.target as SVGElement).closest('svg');
                      if (svgEl) {
                        const rect = svgEl.getBoundingClientRect();
                        const screenX = rect.left + (cx / canvasSize) * rect.width;
                        const screenY = rect.top + (cy / canvasSize) * rect.height;
                        handleVehicleClick(robot, { ...e, clientX: screenX, clientY: screenY } as any);
                      }
                    }}
                  >
                    {/* Selection pulse ring */}
                    {isSelected && (
                      <circle cx={cx} cy={cy} r="18" fill="none" stroke="#f59e0b" strokeWidth="2.5" opacity="0.8">
                        <animate attributeName="r" from="14" to="24" dur="1.2s" repeatCount="indefinite" />
                        <animate attributeName="opacity" from="0.8" to="0" dur="1.2s" repeatCount="indefinite" />
                      </circle>
                    )}

                    {/* Vehicle body */}
                    <circle cx={cx} cy={cy} r="11"
                      fill={isSelected ? '#f59e0b' : '#3b82f6'}
                      stroke="white" strokeWidth="2.5"
                      filter="url(#shadow)" />

                    {/* Direction indicator */}
                    <line x1={cx} y1={cy} x2={ax} y2={ay}
                      stroke="white" strokeWidth="2.5" strokeLinecap="round" />

                    {/* Label background + text */}
                    <rect x={cx - 22} y={cy - 30} width="44" height="16" rx="4"
                      fill="white" stroke="#cbd5e1" strokeWidth="0.5" opacity="0.9" />
                    <text x={cx} y={cy - 18} textAnchor="middle" fill="#1e293b"
                      fontSize="10" fontWeight="bold" style={{ pointerEvents: 'none' }}>
                      {robot.name.replace('机器人-', '车')}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Vehicle popup (rendered at screen position) */}
          {selectedRobot && (
            <VehiclePopup
              robot={selectedRobot}
              x={popupPos.x}
              y={popupPos.y}
              onClose={() => setSelectedRobot(null)}
            />
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-6 left-6 bg-white/95 backdrop-blur-sm rounded-lg p-3 shadow-md border border-slate-200">
        <div className="text-slate-600 text-xs mb-2 font-medium">图例</div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <div className="w-3 h-3 rounded-full bg-blue-500 border border-white" /> 在线车辆
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <div className="w-3 h-3 rounded-full bg-amber-500 border border-white" /> 已选中
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="w-3 h-0.5 bg-slate-400" style={{ width: 14 }} /> 路网
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="w-3 h-0.5 bg-amber-500" style={{ width: 14 }} /> 配送路径
          </div>
        </div>
      </div>
    </div>
  );
}
