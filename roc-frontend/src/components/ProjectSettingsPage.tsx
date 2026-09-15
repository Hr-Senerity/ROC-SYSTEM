import { useState } from 'react';
import { useAuth } from '../app/auth/AuthProvider';
import { useCurrentProject } from '../app/layout/ProjectLayout';
import { apiRequest } from '../shared/api/client';
import { ErrorState } from '../shared/ui/ErrorState';
import { StatusBadge } from '../shared/ui/StatusBadge';
import { Button } from './ui/button';
import { Input } from './ui/input';

export function ProjectSettingsPage() {
  const { project, refreshProject } = useCurrentProject();
  const { token } = useAuth();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      await apiRequest(`/api/projects/${project.id}`, {
        method: 'PATCH', token, body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      await refreshProject();
      setSaved(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '保存项目失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="max-w-2xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div><h2 className="text-lg font-semibold">项目设置</h2><p className="mt-1 text-sm text-slate-600">修改项目名称和说明。</p></div>
        <StatusBadge status={project.status === 'active' ? 'active' : 'inactive'} label={project.status === 'active' ? '启用' : '停用'} />
      </div>
      {error && <div className="mt-5"><ErrorState message={error} /></div>}
      {saved && <p role="status" className="mt-5 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">项目设置已保存。</p>}
      <div className="mt-6 space-y-5">
        <div className="space-y-2">
          <label htmlFor="settings-project-name" className="text-sm font-medium">项目名称</label>
          <Input id="settings-project-name" maxLength={128} value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="space-y-2">
          <label htmlFor="settings-project-description" className="text-sm font-medium">项目描述</label>
          <textarea id="settings-project-description" rows={5} value={description} onChange={(event) => setDescription(event.target.value)} className="w-full rounded-md border border-input bg-white px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        <p className="text-xs text-slate-500">项目状态由服务端管理，当前页面只读展示。</p>
        <Button disabled={!name.trim() || saving} onClick={() => void save()}>{saving ? '保存中…' : '保存设置'}</Button>
      </div>
    </section>
  );
}
