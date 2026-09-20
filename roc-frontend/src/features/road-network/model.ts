export type CoordinateMode = 'metric' | 'legacy-normalized';
export type EdgeDirection = 'both' | 'forward';

export interface RoadNode {
  id: string;
  x: number;
  y: number;
  kind: 'waypoint';
  label: string;
}

export interface RoadEdge {
  id: string;
  from: string;
  to: string;
  direction: EdgeDirection;
  max_speed_mps: number | null;
}

export interface RoadNetwork {
  schema_version: 1;
  coordinate_mode: CoordinateMode;
  nodes: RoadNode[];
  edges: RoadEdge[];
}

export interface RoadNetworkRevision {
  id: string;
  mapId: string;
  version: number;
  schemaVersion: number;
  contentType: string;
  byteSize: number;
  sha256: string;
  createdBy: string | null;
  createdByUsername: string | null;
  createdAt: string;
  network?: RoadNetwork;
}

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, message: string): string {
  if (typeof value !== 'string') throw new Error(message);
  return value;
}

function numberValue(value: unknown, message: string): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) throw new Error(message);
  return parsed;
}

export function emptyRoadNetwork(mode: CoordinateMode): RoadNetwork {
  return { schema_version: 1, coordinate_mode: mode, nodes: [], edges: [] };
}

export function parseRoadNetwork(value: unknown): RoadNetwork {
  const source = record(value, '路网数据格式不正确');
  if (source.schema_version !== 1 || (source.coordinate_mode !== 'metric' && source.coordinate_mode !== 'legacy-normalized')) {
    throw new Error('路网版本或坐标模式不受支持');
  }
  if (!Array.isArray(source.nodes) || !Array.isArray(source.edges)) throw new Error('路网节点或边格式不正确');
  return {
    schema_version: 1,
    coordinate_mode: source.coordinate_mode,
    nodes: source.nodes.map((value, index) => {
      const node = record(value, `节点 ${index + 1} 格式不正确`);
      if (node.kind !== 'waypoint') throw new Error(`节点 ${index + 1} 类型不受支持`);
      return {
        id: requiredString(node.id, `节点 ${index + 1} 缺少 ID`),
        x: numberValue(node.x, `节点 ${index + 1} 的 X 坐标无效`),
        y: numberValue(node.y, `节点 ${index + 1} 的 Y 坐标无效`),
        kind: 'waypoint',
        label: requiredString(node.label, `节点 ${index + 1} 缺少标签`),
      };
    }),
    edges: source.edges.map((value, index) => {
      const edge = record(value, `边 ${index + 1} 格式不正确`);
      if (edge.direction !== 'both' && edge.direction !== 'forward') throw new Error(`边 ${index + 1} 的方向无效`);
      const speed = edge.max_speed_mps === null || edge.max_speed_mps === undefined
        ? null
        : numberValue(edge.max_speed_mps, `边 ${index + 1} 的限速无效`);
      return {
        id: requiredString(edge.id, `边 ${index + 1} 缺少 ID`),
        from: requiredString(edge.from, `边 ${index + 1} 缺少起点`),
        to: requiredString(edge.to, `边 ${index + 1} 缺少终点`),
        direction: edge.direction,
        max_speed_mps: speed,
      };
    }),
  };
}

export function validateRoadNetwork(network: RoadNetwork, expectedMode: CoordinateMode): string[] {
  const errors: string[] = [];
  if (network.coordinate_mode !== expectedMode) errors.push('路网坐标模式与地图不一致');
  if (network.nodes.length > 10_000) errors.push('节点数量不能超过 10,000');
  if (network.edges.length > 50_000) errors.push('边数量不能超过 50,000');
  const nodeIds = new Set<string>();
  network.nodes.forEach((node, index) => {
    if (!identifierPattern.test(node.id)) errors.push(`节点 ${index + 1} 的 ID 不符合规范`);
    if (nodeIds.has(node.id)) errors.push(`节点 ID 重复：${node.id}`);
    nodeIds.add(node.id);
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) errors.push(`节点 ${node.id} 的坐标无效`);
    if (new TextEncoder().encode(node.label).length > 128) errors.push(`节点 ${node.id} 的标签超过 128 字节`);
  });
  const edgeIds = new Set<string>();
  const edgeKeys = new Set<string>();
  network.edges.forEach((edge, index) => {
    if (!identifierPattern.test(edge.id)) errors.push(`边 ${index + 1} 的 ID 不符合规范`);
    if (edgeIds.has(edge.id)) errors.push(`边 ID 重复：${edge.id}`);
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) errors.push(`边 ${edge.id} 引用了不存在的节点`);
    if (edge.from === edge.to) errors.push(`边 ${edge.id} 不能形成自环`);
    const endpoints = edge.direction === 'both' ? [edge.from, edge.to].sort() : [edge.from, edge.to];
    const key = `${edge.direction}:${endpoints[0]}:${endpoints[1]}`;
    if (edgeKeys.has(key)) errors.push(`边 ${edge.id} 与已有连接重复`);
    edgeKeys.add(key);
    if (edge.max_speed_mps !== null && (!Number.isFinite(edge.max_speed_mps) || edge.max_speed_mps <= 0 || edge.max_speed_mps > 100)) {
      errors.push(`边 ${edge.id} 的限速应大于 0 且不超过 100 m/s`);
    }
  });
  return errors;
}

export function canonicalRoadNetwork(network: RoadNetwork): RoadNetwork {
  return {
    schema_version: 1,
    coordinate_mode: network.coordinate_mode,
    nodes: [...network.nodes].sort((left, right) => left.id.localeCompare(right.id)).map((node) => ({ ...node })),
    edges: [...network.edges].sort((left, right) => left.id.localeCompare(right.id)).map((edge) => ({ ...edge })),
  };
}

export function roadNetworkSignature(network: RoadNetwork): string {
  return JSON.stringify(canonicalRoadNetwork(network));
}

function parseRevision(value: unknown, includeNetwork: boolean): RoadNetworkRevision {
  const source = record(value, '路网版本格式不正确');
  return {
    id: requiredString(source.id, '路网版本缺少 ID'),
    mapId: requiredString(source.map_id, '路网版本缺少地图 ID'),
    version: numberValue(source.version, '路网版本号无效'),
    schemaVersion: numberValue(source.schema_version, '路网协议版本无效'),
    contentType: requiredString(source.content_type, '路网内容类型无效'),
    byteSize: numberValue(source.byte_size, '路网字节数无效'),
    sha256: requiredString(source.sha256, '路网摘要无效'),
    createdBy: typeof source.created_by === 'string' ? source.created_by : null,
    createdByUsername: typeof source.created_by_username === 'string' ? source.created_by_username : null,
    createdAt: requiredString(source.created_at, '路网创建时间无效'),
    network: includeNetwork ? parseRoadNetwork(source.network) : undefined,
  };
}

export function parseRevisionList(value: unknown): { revisions: RoadNetworkRevision[]; current: RoadNetworkRevision | null } {
  const source = record(value, '路网版本列表格式不正确');
  if (!Array.isArray(source.revisions)) throw new Error('路网版本列表格式不正确');
  const revisions = source.revisions.map((item) => parseRevision(item, false));
  const current = source.current_revision === null || source.current_revision === undefined
    ? null
    : parseRevision(source.current_revision, false);
  return { revisions, current };
}

export function parseRevisionResponse(value: unknown): RoadNetworkRevision {
  const source = record(value, '路网版本响应格式不正确');
  return parseRevision(source.revision, true);
}
