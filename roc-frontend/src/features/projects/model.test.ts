import { describe, expect, it } from 'vitest';
import { parseProject, parseProjectList } from './model';

describe('project DTO parsing', () => {
  it('maps database field names into the UI model', () => {
    expect(parseProject({
      id: 'project-1',
      user_id: 'user-1',
      owner_username: 'admin',
      name: '配送中心',
      description: null,
      status: 'active',
      created_at: '2026-09-15T00:00:00Z',
      updated_at: '2026-09-15T01:00:00Z',
    })).toEqual({
      id: 'project-1',
      ownerId: 'user-1',
      ownerUsername: 'admin',
      name: '配送中心',
      description: '',
      status: 'active',
      createdAt: '2026-09-15T00:00:00Z',
      updatedAt: '2026-09-15T01:00:00Z',
    });
  });

  it('rejects malformed project lists instead of treating them as empty', () => {
    expect(() => parseProjectList({ ok: true, projects: null })).toThrow('项目列表格式不正确');
  });
});
