export interface ProjectMap {
  id: string;
  projectId: string;
  name: string;
  imageUrl: string | null;
  isDefault: boolean;
  createdAt: string;
  coordinateOriginX: number | null;
  coordinateOriginY: number | null;
  roadNetwork: unknown;
  coordinateMode: 'legacy-normalized' | 'metric';
  imageWidth: number | null;
  imageHeight: number | null;
  resolution: number | null;
  originTheta: number;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('地图数据格式不正确');
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`地图字段 ${field} 格式不正确`);
  return value;
}

export function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 't') return true;
  if (value === 'false' || value === 'f') return false;
  throw new Error('布尔字段格式不正确');
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

export function parseProjectMap(value: unknown): ProjectMap {
  const source = record(value);
  return {
    id: requiredString(source.id, 'id'),
    projectId: requiredString(source.project_id, 'project_id'),
    name: requiredString(source.name, 'name'),
    imageUrl: typeof source.image_url === 'string' && source.image_url ? source.image_url : null,
    isDefault: parseBoolean(source.is_active),
    createdAt: requiredString(source.created_at, 'created_at'),
    coordinateOriginX: nullableNumber(source.coordinate_origin_x),
    coordinateOriginY: nullableNumber(source.coordinate_origin_y),
    roadNetwork: parseJson(source.road_network),
    coordinateMode: source.coordinate_mode === 'metric' ? 'metric' : 'legacy-normalized',
    imageWidth: nullableNumber(source.image_width),
    imageHeight: nullableNumber(source.image_height),
    resolution: nullableNumber(source.resolution),
    originTheta: nullableNumber(source.origin_theta) ?? 0,
  };
}

export function parseProjectMapList(value: unknown): ProjectMap[] {
  const source = record(value);
  if (!Array.isArray(source.maps)) throw new Error('地图列表格式不正确');
  return source.maps.map(parseProjectMap);
}

export function parseProjectMapResponse(value: unknown): ProjectMap {
  const source = record(value);
  if (!source.map) throw new Error('地图详情格式不正确');
  return parseProjectMap(source.map);
}
