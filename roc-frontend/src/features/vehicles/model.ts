export type VehicleStatus = 'online' | 'offline' | 'error';

export interface Vehicle {
  id: string;
  projectId: string | null;
  mapId: string | null;
  name: string;
  ip: string;
  status: VehicleStatus;
  cpu: number;
  memory: number;
  battery: number;
  localizationConfidence: number;
  position: { x: number; y: number; theta: number } | null;
  velocity: { linear: number; angular: number };
  deliveryPath: Array<{ x: number; y: number }>;
  version: string;
  receivedAt: string | null;
  lastHeartbeat: string | null;
  deviceEnabled: boolean;
  deviceTokenHint: string | null;
  deliveredRoadRevisionId: string | null;
  deliveredMapArtifactId: string | null;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('车辆数据格式不正确');
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`车辆字段 ${field} 格式不正确`);
  return value;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = finiteNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function status(value: unknown): VehicleStatus {
  return value === 'online' || value === 'error' ? value : 'offline';
}

function path(value: unknown): Array<{ x: number; y: number }> {
  let candidate = value;
  if (typeof value === 'string') {
    try { candidate = JSON.parse(value) as unknown; } catch { return []; }
  }
  if (!Array.isArray(candidate)) return [];
  return candidate.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const source = item as Record<string, unknown>;
    const x = optionalFiniteNumber(source.x);
    const y = optionalFiniteNumber(source.y);
    return x === null || y === null ? [] : [{ x, y }];
  });
}

export function parseVehicle(value: unknown): Vehicle {
  const source = record(value);
  const x = optionalFiniteNumber(source.position_x);
  const y = optionalFiniteNumber(source.position_y);
  const theta = optionalFiniteNumber(source.position_theta);
  return {
    id: requiredString(source.id, 'id'),
    projectId: nullableString(source.project_id),
    mapId: nullableString(source.map_id),
    name: requiredString(source.name, 'name'),
    ip: requiredString(source.ip, 'ip'),
    status: status(source.status),
    cpu: finiteNumber(source.cpu),
    memory: finiteNumber(source.memory),
    battery: finiteNumber(source.battery),
    localizationConfidence: finiteNumber(source.localization_confidence),
    position: x === null || y === null || theta === null ? null : { x, y, theta },
    velocity: {
      linear: finiteNumber(source.velocity_linear),
      angular: finiteNumber(source.velocity_angular),
    },
    deliveryPath: path(source.delivery_path),
    version: typeof source.version === 'string' ? source.version : String(source.version ?? '0'),
    receivedAt: nullableString(source.received_at),
    lastHeartbeat: nullableString(source.last_heartbeat),
    deviceEnabled: source.device_enabled === true,
    deviceTokenHint: nullableString(source.device_token_hint),
    deliveredRoadRevisionId: nullableString(source.delivered_road_revision_id),
    deliveredMapArtifactId: nullableString(source.delivered_map_artifact_id),
  };
}

export function parseVehicleList(value: unknown): Vehicle[] {
  const source = record(value);
  if (!Array.isArray(source.vehicles)) throw new Error('车辆列表格式不正确');
  return source.vehicles.map(parseVehicle);
}
