import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth, API_BASE } from '../App';
import { ArrowLeft, Zap, Maximize2, Minimize2, Download } from 'lucide-react';
import { VehiclePopup } from './VehiclePopup';
import type { Robot, PathNode } from '../types/robot';


// Coordinate mapping: domain 0-100 → pixel range
function mapCoord(coord: number, canvasSize: number): number {
  return (coord / 100) * canvasSize;
}

export function MapDetailPage() {
  const { isLoggedIn, token } = useAuth();
  const navigate = useNavigate();
  const { projectId, mapId } = useParams();

  const [robots, setRobots] = useState<Robot[]>([]);
  const [roadNetwork, setRoadNetwork] = useState<{ from: PathNode; to: PathNode }[]>([]);
  const [mapImageUrl, setMapImageUrl] = useState("");
  const [selectedRobot, setSelectedRobot] = useState<Robot | null>(null);

  // Fetch vehicles from API
  useEffect(() => {
    const fetchVehicles = async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/vehicles`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await resp.json();
        if (data.ok) {
          const vehicles = (data.vehicles || []).map((v: any) => ({
            ...v,
            status: v.status || 'offline',
            position: { x: parseFloat(v.position_x) || 0, y: parseFloat(v.position_y) || 0, theta: parseFloat(v.position_theta) || 0 },
            velocity: { linear: parseFloat(v.velocity_linear) || 0, angular: parseFloat(v.velocity_angular) || 0 },
            deliveryPath: v.delivery_path ? (typeof v.delivery_path === 'string' ? JSON.parse(v.delivery_path) : v.delivery_path) : [],
            logs: v.logs || [],
          }));
          setRobots(vehicles);
        }
      } catch { /* ignore */ }
    };
    fetchVehicles();
  }, []);

  // Fetch map data (road network)
  useEffect(() => {
    const fetchMapData = async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/projects/${projectId}/maps`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await resp.json();
        if (data.ok) {
          const map = (data.maps || []).find((m: any) => m.id === mapId);
          if (map?.image_url) setMapImageUrl(map.image_url);
          if (map?.road_network) {
            const rn = typeof map.road_network === 'string' ? JSON.parse(map.road_network) : map.road_network;
            const edges: { from: PathNode; to: PathNode }[] = [];
            if (rn.nodes && rn.edges) {
              const nodeMap = new Map<string, PathNode>();
              rn.nodes.forEach((n: any) => nodeMap.set(n.id, { x: n.x, y: n.y }));
              rn.edges.forEach((e: any) => {
                const from = nodeMap.get(e.from);
                const to = nodeMap.get(e.to);
                if (from && to) edges.push({ from, to });
              });
            }
            setRoadNetwork(edges);
          }
        }
      } catch { /* ignore */ }
    };
    if (projectId && mapId) fetchMapData();
  }, [projectId, mapId]);

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

  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState(700);

  // Responsive canvas
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const resize = () => {
      // Use the flex container available space
      const availW = window.innerWidth - 320;
      const availH = window.innerHeight - 160;
      const size = Math.min(availW, availH);
      setCanvasSize(Math.max(400, size));
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const mapMargin = 30;

  const onlineVehicles = robots.filter(r => r.status === 'online' && r.position);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setZoom(prevZoom => {
        const newZoom = Math.max(0.5, Math.min(3, prevZoom + delta));
        setPan(prevPan => ({
          x: mx - (mx - prevPan.x) * (newZoom / prevZoom),
          y: my - (my - prevPan.y) * (newZoom / prevZoom),
        }));
        return newZoom;
      });
    } else {
      setZoom(z => Math.max(0.5, Math.min(3, z + delta)));
    }
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

  const handleExport = () => {
    // Discretize each edge into points with poses (x,y,z,qx,qy,qz,qw)
    const points: number[][] = [];
    roadNetwork.forEach(seg => {
      const dx = seg.to.x - seg.from.x;
      const dy = seg.to.y - seg.from.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const steps = Math.max(2, Math.ceil(length / 5)); // discretize every 5 units
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = seg.from.x + dx * t;
        const y = seg.from.y + dy * t;
        const z = 0;
        // Quaternion from direction angle (rotation around Z)
        const theta = Math.atan2(dy, dx);
        const qx = 0;
        const qy = 0;
        const qz = Math.sin(theta / 2);
        const qw = Math.cos(theta / 2);
        points.push([x, y, z, qx, qy, qz, qw]);
      }
    });
    const csv = points.map(p => p.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `road_network_map_${mapId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isLoggedIn) {
    navigate('/login');
    return null;
  }

  const containerClass = isFullscreen
    ? 'fixed inset-0 z-50 bg-white'
    : 'min-h-screen bg-gradient-to-br from-slate-100 to-slate-200';

  return (
    <>
      <div className={containerClass} style={{ overflow: 'hidden', position: 'relative' }}>
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
            {roadNetwork.length > 0 && (
              <button onClick={handleExport} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex items-center gap-1">
                <Download className="w-4 h-4" /> 导出
              </button>
            )}
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
        className="w-full flex-1 flex items-center justify-center overflow-hidden"
        style={{ height: isFullscreen ? 'calc(100vh - 60px)' : 'calc(100vh - 120px)' }}
        ref={canvasRef}
      >
        <div
          className="relative rounded-xl overflow-hidden shadow-lg border border-slate-300 cursor-grab bg-white"
          style={mapImageUrl ? { width: canvasSize, height: canvasSize, backgroundImage: `url(${mapImageUrl})`, backgroundSize: "contain", backgroundRepeat: "no-repeat", backgroundPosition: "center" } : { width: canvasSize, height: canvasSize }}
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

              {/* Layer 1: Background */}
              <rect width={canvasSize} height={canvasSize} fill="rgba(255,255,255,0.05)" />
              {!mapImageUrl && <rect width={canvasSize} height={canvasSize} fill="url(#minorGrid)" />}
              {!mapImageUrl && <rect width={canvasSize} height={canvasSize} fill="url(#majorGrid)" />}

              {!mapImageUrl && <text x={canvasSize / 2} y={canvasSize / 2} textAnchor="middle" fill="#94a3b8" fontSize="14">未上传地图图片</text>}

              {/* Layer 3: Road network (loaded from map data) */}
              {roadNetwork.map((seg, idx) => {
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
                roadNetwork.forEach(seg => {
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
                        <circle cx={x1} cy={y1} r={6/zoom} fill="#f59e0b" stroke="white" strokeWidth={2/zoom} />
                      </g>
                    );
                  })}
                  {(() => {
                    const last = selectedRobot.deliveryPath[selectedRobot.deliveryPath.length - 1];
                    return (
                      <circle
                        cx={mapCoord(last.x, canvasSize)}
                        cy={mapCoord(last.y, canvasSize)}
                        r={6/zoom} fill="#f59e0b" stroke="white" strokeWidth={2/zoom}
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
                const arrowLen = 14 / zoom;
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
                      <circle cx={cx} cy={cy} r={18/zoom} fill="none" stroke="#f59e0b" strokeWidth="2.5" opacity="0.8">
                        <animate attributeName="r" from="14" to="24" dur="1.2s" repeatCount="indefinite" />
                        <animate attributeName="opacity" from="0.8" to="0" dur="1.2s" repeatCount="indefinite" />
                      </circle>
                    )}

                    {/* Vehicle body */}
                    <circle cx={cx} cy={cy} r={11/zoom}
                      fill={isSelected ? '#f59e0b' : '#3b82f6'}
                      stroke="white" strokeWidth="2.5"
                      filter="url(#shadow)" />

                    {/* Direction indicator */}
                    <line x1={cx} y1={cy} x2={ax} y2={ay}
                      stroke="white" strokeWidth="2.5" strokeLinecap="round" />

                    {/* Label background + text */}
                    <rect x={cx - 22} y={cy - 30/zoom} width={44/zoom} height={16/zoom} rx="4"
                      fill="white" stroke="#cbd5e1" strokeWidth="0.5" opacity="0.9" />
                    <text x={cx} y={cy - 18} textAnchor="middle" fill="#1e293b"
                      fontSize={10/zoom} fontWeight="bold" style={{ pointerEvents: 'none' }}>
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
    </div>
      <MapLegend />
    </>
  );
}

// Legend rendered outside main container to avoid overflow clipping
function MapLegend() {
  return (
    <div style={{ position: 'fixed', bottom: 16, left: 16, zIndex: 9999, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(4px)', borderRadius: 8, padding: '6px 8px', boxShadow: '0 1px 4px rgba(0,0,0,0.15)', border: '1px solid #e2e8f0', pointerEvents: 'none' }}>
      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2, fontWeight: 600 }}>图例</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px' }}>
        {[
          { color: '#3b82f6', shape: 'circle', label: '在线车辆' },
          { color: '#f59e0b', shape: 'circle', label: '已选中' },
          { color: '#94a3b8', shape: 'circle', label: '离线/异常' },
          { color: '#3b82f6', shape: 'arrow', label: '方向' },
          { color: '#64748b', shape: 'line', label: '路网' },
          { color: '#f59e0b', shape: 'line', label: '配送路径' },
          { color: '#475569', shape: 'dot', label: '路口节点' },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#64748b', whiteSpace: 'nowrap', gridColumn: i === 6 ? '1 / span 2' : undefined }}>
            {item.shape === 'circle' && <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, border: '1px solid white', flexShrink: 0 }} />}
            {item.shape === 'line' && <div style={{ width: 14, height: 2, background: item.color, flexShrink: 0 }} />}
            {item.shape === 'dot' && <div style={{ width: 6, height: 6, borderRadius: '50%', background: item.color, flexShrink: 0 }} />}
            {item.shape === 'arrow' && <span style={{ color: item.color, flexShrink: 0, lineHeight: 1 }}>→</span>}
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}
