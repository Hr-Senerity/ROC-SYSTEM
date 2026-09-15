export interface Project {
  id: string;
  ownerId: string;
  ownerUsername: string;
  name: string;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string | null;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('项目数据格式不正确');
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`项目字段 ${field} 格式不正确`);
  return value;
}

export function parseProject(value: unknown): Project {
  const source = record(value);
  return {
    id: string(source.id, 'id'),
    ownerId: string(source.user_id, 'user_id'),
    ownerUsername: typeof source.owner_username === 'string' ? source.owner_username : '',
    name: string(source.name, 'name'),
    description: typeof source.description === 'string' ? source.description : '',
    status: typeof source.status === 'string' ? source.status : 'inactive',
    createdAt: string(source.created_at, 'created_at'),
    updatedAt: typeof source.updated_at === 'string' ? source.updated_at : null,
  };
}

export function parseProjectList(value: unknown): Project[] {
  const source = record(value);
  if (!Array.isArray(source.projects)) throw new Error('项目列表格式不正确');
  return source.projects.map(parseProject);
}
