import { useEffect, useState } from 'react';
import { KeyRound, Save, Shield, User } from 'lucide-react';
import { useAuth } from '../app/auth/AuthProvider';
import { apiRequest } from '../shared/api/client';
import { isAbortError } from '../shared/api/errors';
import { ErrorState } from '../shared/ui/ErrorState';
import { PageHeader } from '../shared/ui/PageHeader';
import { StatusBadge } from '../shared/ui/StatusBadge';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface UserProfile {
  username: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
}

export function ProfilePage() {
  const { token } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const loadProfile = async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const payload = await apiRequest<{ user?: Record<string, unknown> }>('/api/auth/me', { token, signal });
      if (!payload.user) throw new Error('服务端未返回用户资料');
      setProfile({
        username: typeof payload.user.username === 'string' ? payload.user.username : '',
        email: typeof payload.user.email === 'string' ? payload.user.email : '',
        role: typeof payload.user.role === 'string' ? payload.user.role : 'regular',
        status: typeof payload.user.status === 'string' ? payload.user.status : 'active',
        createdAt: typeof payload.user.created_at === 'string' ? payload.user.created_at : '',
      });
    } catch (requestError) {
      if (!isAbortError(requestError)) setError(requestError instanceof Error ? requestError.message : '无法加载账户资料');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void loadProfile(controller.signal);
    return () => controller.abort();
  }, [token]);

  const changePassword = async () => {
    setMessage(null);
    if (!oldPassword || !newPassword || !confirmPassword) { setMessage({ kind: 'error', text: '请填写全部密码字段' }); return; }
    if (newPassword.length < 6) { setMessage({ kind: 'error', text: '新密码至少需要 6 个字符' }); return; }
    if (newPassword !== confirmPassword) { setMessage({ kind: 'error', text: '两次输入的新密码不一致' }); return; }
    setSaving(true);
    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST', token,
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      });
      setOldPassword(''); setNewPassword(''); setConfirmPassword('');
      setMessage({ kind: 'success', text: '密码已更新' });
    } catch (requestError) {
      setMessage({ kind: 'error', text: requestError instanceof Error ? requestError.message : '密码修改失败' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-6">
      <PageHeader title="个人中心" description="查看账户信息并管理登录密码。通知设置将在服务端支持持久化后提供。" />
      {error && <ErrorState message={error} onRetry={() => void loadProfile()} />}
      {loading && <div className="rounded-lg border bg-white p-8 text-center text-slate-500">正在加载账户资料…</div>}
      {!loading && profile && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,.8fr)]">
          <article className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-4 border-b border-slate-200 pb-5"><span className="grid size-14 place-items-center rounded-full bg-blue-50 text-blue-700"><User className="size-7" /></span><div><h2 className="text-lg font-semibold text-slate-950">{profile.username}</h2><p className="text-sm text-slate-500">{profile.email || '未设置邮箱'}</p></div></div>
            <dl className="mt-6 grid gap-5 sm:grid-cols-2">
              <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">账户角色</dt><dd className="mt-2 flex items-center gap-2 text-sm text-slate-900"><Shield className="size-4 text-slate-400" />{profile.role === 'super_admin' ? '超级管理员' : '普通用户'}</dd></div>
              <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">账户状态</dt><dd className="mt-2"><StatusBadge status={profile.status === 'active' ? 'active' : 'inactive'} label={profile.status === 'active' ? '正常' : '已停用'} /></dd></div>
              <div className="sm:col-span-2"><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">注册时间</dt><dd className="mt-2 text-sm text-slate-900">{profile.createdAt ? new Date(profile.createdAt).toLocaleString('zh-CN') : '未知'}</dd></div>
            </dl>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-2"><KeyRound className="size-5 text-blue-700" /><h2 className="text-lg font-semibold text-slate-950">修改密码</h2></div>
            {message && <p role="status" className={`mt-4 rounded-md p-3 text-sm ${message.kind === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{message.text}</p>}
            <div className="mt-5 space-y-4">
              <label className="block space-y-1.5"><span className="text-sm font-medium">当前密码</span><Input type="password" autoComplete="current-password" value={oldPassword} onChange={(event) => setOldPassword(event.target.value)} /></label>
              <label className="block space-y-1.5"><span className="text-sm font-medium">新密码</span><Input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
              <label className="block space-y-1.5"><span className="text-sm font-medium">确认新密码</span><Input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
              <Button onClick={() => void changePassword()} disabled={saving}><Save />{saving ? '保存中…' : '更新密码'}</Button>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
