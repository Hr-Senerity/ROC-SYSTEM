export type DeploymentTaskState =
  | 'queued'
  | 'offered'
  | 'accepted'
  | 'downloading'
  | 'delivering'
  | 'delivered'
  | 'failed'
  | 'canceled'
  | 'expired';

export interface DeploymentTask {
  id: string;
  batchId: string;
  vehicleId: string;
  state: DeploymentTaskState;
  attempt: number;
  maxAttempts: number;
  progress: number;
  errorCode: string | null;
  errorMessage: string | null;
  offeredAt: string | null;
  acceptedAt: string | null;
  deliveredAt: string | null;
  updatedAt: string;
}

export interface Deployment {
  id: string;
  projectId: string;
  resourceType: 'road_network' | 'map';
  resourceRevisionId: string;
  createdBy: string;
  idempotencyKey: string;
  cancelRequestedAt: string | null;
  createdAt: string;
  tasks: DeploymentTask[];
}

const states = new Set<DeploymentTaskState>([
  'queued', 'offered', 'accepted', 'downloading', 'delivering',
  'delivered', 'failed', 'canceled', 'expired',
]);

function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value) throw new Error(message);
  return value;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function numberValue(value: unknown, message: string): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) throw new Error(message);
  return parsed;
}

function parseTask(value: unknown): DeploymentTask {
  const source = record(value, '下发任务格式不正确');
  if (typeof source.state !== 'string' || !states.has(source.state as DeploymentTaskState)) {
    throw new Error('下发任务状态不受支持');
  }
  return {
    id: requiredString(source.id, '下发任务缺少 ID'),
    batchId: requiredString(source.batch_id, '下发任务缺少批次 ID'),
    vehicleId: requiredString(source.vehicle_id, '下发任务缺少车辆 ID'),
    state: source.state as DeploymentTaskState,
    attempt: numberValue(source.attempt, '下发任务尝试次数无效'),
    maxAttempts: numberValue(source.max_attempts, '下发任务最大尝试次数无效'),
    progress: numberValue(source.progress, '下发任务进度无效'),
    errorCode: nullableString(source.error_code),
    errorMessage: nullableString(source.error_message),
    offeredAt: nullableString(source.offered_at),
    acceptedAt: nullableString(source.accepted_at),
    deliveredAt: nullableString(source.delivered_at),
    updatedAt: requiredString(source.updated_at, '下发任务更新时间无效'),
  };
}

export function parseDeploymentResponse(value: unknown): Deployment {
  const envelope = record(value, '下发批次响应格式不正确');
  const source = record(envelope.deployment, '下发批次格式不正确');
  if (source.resource_type !== 'road_network' && source.resource_type !== 'map') {
    throw new Error('下发资源类型不受支持');
  }
  if (!Array.isArray(source.tasks)) throw new Error('下发任务列表格式不正确');
  return {
    id: requiredString(source.id, '下发批次缺少 ID'),
    projectId: requiredString(source.project_id, '下发批次缺少项目 ID'),
    resourceType: source.resource_type,
    resourceRevisionId: requiredString(source.resource_revision_id, '下发批次缺少资源版本 ID'),
    createdBy: requiredString(source.created_by, '下发批次缺少创建者'),
    idempotencyKey: requiredString(source.idempotency_key, '下发批次缺少幂等键'),
    cancelRequestedAt: nullableString(source.cancel_requested_at),
    createdAt: requiredString(source.created_at, '下发批次缺少创建时间'),
    tasks: source.tasks.map(parseTask),
  };
}

export function deploymentTerminal(deployment: Deployment): boolean {
  return deployment.tasks.every((task) => ['delivered', 'failed', 'canceled', 'expired'].includes(task.state));
}

export function retryableVehicleIds(deployment: Deployment): string[] {
  return deployment.tasks
    .filter((task) => ['failed', 'canceled', 'expired'].includes(task.state))
    .map((task) => task.vehicleId);
}

export function stateLabel(state: DeploymentTaskState): string {
  return {
    queued: '等待车辆上线', offered: '已通知车辆', accepted: '车辆已接单',
    downloading: '下载中', delivering: '交付处理中', delivered: '已送达',
    failed: '失败', canceled: '已取消', expired: '租约已过期',
  }[state];
}
