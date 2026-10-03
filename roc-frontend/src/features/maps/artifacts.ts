export interface MapArtifact {
  id: string;
  mapId: string;
  version: number;
  contentType: string;
  byteSize: number;
  sha256: string;
  packageVersion: number;
  mapFormat: string | null;
  coordinateMode: string | null;
  fileCount: number;
  imageWidth: number | null;
  imageHeight: number | null;
  resolution: number | null;
  originX: number | null;
  originY: number | null;
  originTheta: number | null;
  createdAt: string;
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value) throw new Error(message);
  return value;
}

function numberValue(value: unknown, message: string): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) throw new Error(message);
  return parsed;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseMapArtifact(value: unknown): MapArtifact {
  const source = record(value, '地图制品格式不正确');
  return {
    id: stringValue(source.id, '地图制品缺少 ID'),
    mapId: stringValue(source.map_id, '地图制品缺少地图 ID'),
    version: numberValue(source.version, '地图制品版本无效'),
    contentType: stringValue(source.content_type, '地图制品类型无效'),
    byteSize: numberValue(source.byte_size, '地图制品大小无效'),
    sha256: stringValue(source.sha256, '地图制品摘要无效'),
    packageVersion: nullableNumber(source.package_version) ?? 1,
    mapFormat: typeof source.map_format === 'string' ? source.map_format : null,
    coordinateMode: typeof source.coordinate_mode === 'string' ? source.coordinate_mode : null,
    fileCount: nullableNumber(source.file_count) ?? 1,
    imageWidth: nullableNumber(source.image_width),
    imageHeight: nullableNumber(source.image_height),
    resolution: nullableNumber(source.resolution),
    originX: nullableNumber(source.origin_x),
    originY: nullableNumber(source.origin_y),
    originTheta: nullableNumber(source.origin_theta),
    createdAt: stringValue(source.created_at, '地图制品创建时间无效'),
  };
}

export function parseMapArtifactList(value: unknown): { artifacts: MapArtifact[]; current: MapArtifact | null } {
  const source = record(value, '地图制品列表格式不正确');
  if (!Array.isArray(source.artifacts)) throw new Error('地图制品列表格式不正确');
  return {
    artifacts: source.artifacts.map(parseMapArtifact),
    current: source.current_artifact ? parseMapArtifact(source.current_artifact) : null,
  };
}

export function parseMapArtifactResponse(value: unknown): MapArtifact {
  const source = record(value, '地图制品响应格式不正确');
  return parseMapArtifact(source.artifact);
}
