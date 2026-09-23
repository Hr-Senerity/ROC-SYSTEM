import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Box, Eye, Search, Server, ShieldCheck, Trash2, UserCheck, Users, UserX } from 'lucide-react';
import { useAuth } from '../app/auth/AuthProvider';
import { apiRequest } from '../shared/api/client';
import { ErrorState } from '../shared/ui/ErrorState';
import { PageHeader } from '../shared/ui/PageHeader';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from './ui/alert-dialog';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { InvitationCodesPanel } from './InvitationCodesPanel';

interface UserData {
  id: string;
  username: string;
  email: string;
  role: 'super_admin' | 'regular';
  status: 'active' | 'disabled';
  created_at: string;
  updated_at: string;
}

interface UserStats { projects: number; vehicles: number }
interface SystemStats {
  total_users: number;
  active_users: number;
  total_projects: number;
  total_vehicles: number;
  online_vehicles: number;
}

interface UserListResponse { users?: UserData[]; total?: number }
interface StatsResponse { stats?: SystemStats }
interface UserDetailResponse { user?: UserData; stats?: UserStats }
interface PendingAction { kind: 'status' | 'delete'; user: UserData }

const PAGE_SIZE = 20;

export function SuperAdminPage() {
  const { token, username } = useAuth();
  const [users, setUsers] = useState<UserData[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (search) params.set('search', search);
    if (roleFilter) params.set('role', roleFilter);
    if (statusFilter) params.set('status', statusFilter);
    try {
      const data = await apiRequest<UserListResponse>(`/api/admin/users?${params}`, { token });
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '无法加载平台账户');
    } finally {
      setLoading(false);
    }
  }, [page, roleFilter, search, statusFilter, token]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await apiRequest<StatsResponse>('/api/admin/stats', { token });
      setStats(data.stats || null);
    } catch {
      setStats(null);
    }
  }, [token]);

  useEffect(() => { void fetchUsers(); }, [fetchUsers]);
  useEffect(() => { void fetchStats(); }, [fetchStats]);

  const searchAccounts = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchDraft.trim());
  };

  const viewDetail = async (user: UserData) => {
    setSelectedUser(user);
    setUserStats(null);
    setDetailLoading(true);
    try {
      const data = await apiRequest<UserDetailResponse>(`/api/admin/users/${user.id}`, { token });
      if (data.user) setSelectedUser(data.user);
      setUserStats(data.stats || null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '无法加载账户详情');
    } finally {
      setDetailLoading(false);
    }
  };

  const executeAction = async () => {
    if (!pendingAction || actionLoading) return;
    setActionLoading(true);
    setError('');
    const { user, kind } = pendingAction;
    try {
      if (kind === 'status') {
        const nextStatus = user.status === 'active' ? 'disabled' : 'active';
        await apiRequest(`/api/admin/users/${user.id}/status`, {
          method: 'PATCH', token, body: JSON.stringify({ status: nextStatus }),
        });
        if (selectedUser?.id === user.id) setSelectedUser({ ...selectedUser, status: nextStatus });
      } else {
        await apiRequest(`/api/admin/users/${user.id}`, { method: 'DELETE', token });
        if (selectedUser?.id === user.id) setSelectedUser(null);
      }
      setPendingAction(null);
      await Promise.all([fetchUsers(), fetchStats()]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '平台账户操作失败');
      setPendingAction(null);
    } finally {
      setActionLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isSelf = (user: UserData) => user.username === username;

  return (
    <section className="space-y-6">
      <PageHeader
        title="平台账户"
        description="这里管理数据库中的全部平台账户及其资源，并签发一次性注册邀请码。新注册账户始终为普通用户。"
        actions={<span className="inline-flex h-9 items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 text-xs font-medium text-indigo-700"><ShieldCheck className="size-4" />超级管理员专属</span>}
      />

      {stats && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard icon={<Users />} label="平台账户" value={stats.total_users} tone="blue" />
          <StatCard icon={<UserCheck />} label="活跃账户" value={stats.active_users} tone="emerald" />
          <StatCard icon={<Box />} label="全部项目" value={stats.total_projects} tone="amber" />
          <StatCard icon={<Server />} label="全部车辆" value={stats.total_vehicles} tone="violet" />
          <StatCard icon={<span className="size-2.5 rounded-full bg-emerald-500" />} label="在线车辆" value={stats.online_vehicles} tone="emerald" />
        </div>
      )}

      <InvitationCodesPanel />

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4 sm:p-5">
          <form onSubmit={searchAccounts} className="flex flex-col gap-3 lg:flex-row">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" />
              <span className="sr-only">搜索平台账户</span>
              <Input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} className="pl-9" placeholder="搜索用户名或邮箱" />
            </label>
            <select value={roleFilter} onChange={(event) => { setPage(1); setRoleFilter(event.target.value); }} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm">
              <option value="">全部角色</option><option value="super_admin">超级管理员</option><option value="regular">普通用户</option>
            </select>
            <select value={statusFilter} onChange={(event) => { setPage(1); setStatusFilter(event.target.value); }} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm">
              <option value="">全部状态</option><option value="active">正常</option><option value="disabled">已停用</option>
            </select>
            <Button type="submit">查询</Button>
          </form>
        </div>

        {error && <div className="p-4"><ErrorState message={error} onRetry={() => void fetchUsers()} /></div>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">账户</th><th className="px-5 py-3">角色</th><th className="px-5 py-3">状态</th><th className="px-5 py-3">注册时间</th><th className="px-5 py-3 text-right">操作</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50/80">
                  <td className="px-5 py-4"><p className="font-medium text-slate-950">{user.username}{isSelf(user) && <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-700">当前账户</span>}</p><p className="mt-0.5 text-xs text-slate-500">{user.email}</p></td>
                  <td className="px-5 py-4"><RoleBadge role={user.role} /></td>
                  <td className="px-5 py-4"><AccountStatusBadge status={user.status} /></td>
                  <td className="px-5 py-4 text-slate-500">{new Date(user.created_at).toLocaleDateString('zh-CN')}</td>
                  <td className="px-5 py-4"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => void viewDetail(user)} aria-label={`查看 ${user.username}`}><Eye /></Button><Button variant="ghost" size="icon" disabled={isSelf(user)} onClick={() => setPendingAction({ kind: 'status', user })} aria-label={`${user.status === 'active' ? '停用' : '启用'} ${user.username}`} className="text-amber-700">{user.status === 'active' ? <UserX /> : <UserCheck />}</Button><Button variant="ghost" size="icon" disabled={isSelf(user)} onClick={() => setPendingAction({ kind: 'delete', user })} aria-label={`删除 ${user.username}`} className="text-red-700"><Trash2 /></Button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <p className="border-t p-8 text-center text-sm text-slate-500">正在加载平台账户…</p>}
        {!loading && users.length === 0 && <p className="border-t p-10 text-center text-sm text-slate-500">没有符合条件的平台账户</p>}
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-500"><span>共 {total} 个账户</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>上一页</Button><span>{page} / {totalPages}</span><Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>下一页</Button></div></div>
      </div>

      <Dialog open={Boolean(selectedUser)} onOpenChange={(open) => { if (!open) setSelectedUser(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>平台账户详情</DialogTitle><DialogDescription>账户身份和其在数据库中直接拥有的资源统计。</DialogDescription></DialogHeader>
          {selectedUser && <div className="space-y-4"><div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4"><div><p className="font-semibold text-slate-950">{selectedUser.username}</p><p className="mt-1 text-sm text-slate-500">{selectedUser.email}</p></div><div className="space-y-2 text-right"><RoleBadge role={selectedUser.role} /><div><AccountStatusBadge status={selectedUser.status} /></div></div></div><dl className="grid grid-cols-2 gap-3"><div className="rounded-xl border p-4"><dt className="text-xs text-slate-500">拥有项目</dt><dd className="mt-1 text-2xl font-semibold text-slate-950">{detailLoading ? '…' : userStats?.projects ?? 0}</dd></div><div className="rounded-xl border p-4"><dt className="text-xs text-slate-500">拥有车辆</dt><dd className="mt-1 text-2xl font-semibold text-slate-950">{detailLoading ? '…' : userStats?.vehicles ?? 0}</dd></div></dl><p className="text-xs text-slate-500">注册时间：{new Date(selectedUser.created_at).toLocaleString('zh-CN')}</p>{!isSelf(selectedUser) && <div className="flex justify-end gap-2 border-t pt-4"><Button variant="outline" className="text-amber-700" onClick={() => setPendingAction({ kind: 'status', user: selectedUser })}>{selectedUser.status === 'active' ? '停用账户' : '启用账户'}</Button><Button variant="outline" className="text-red-700" onClick={() => setPendingAction({ kind: 'delete', user: selectedUser })}>删除账户</Button></div>}</div>}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingAction)} onOpenChange={(open) => { if (!open && !actionLoading) setPendingAction(null); }}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{pendingAction?.kind === 'delete' ? `删除账户“${pendingAction.user.username}”？` : `${pendingAction?.user.status === 'active' ? '停用' : '启用'}账户“${pendingAction?.user.username}”？`}</AlertDialogTitle><AlertDialogDescription>{pendingAction?.kind === 'delete' ? '此操作不可撤销，并会级联删除该账户拥有的项目、车辆及关联数据。' : pendingAction?.user.status === 'active' ? '停用后，该账户已有会话将在下一次鉴权时失效，无法继续访问工作台。' : '启用后，该账户可重新登录并访问自己拥有的资源。'}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={actionLoading}>取消</AlertDialogCancel><AlertDialogAction disabled={actionLoading} onClick={(event) => { event.preventDefault(); void executeAction(); }} className={pendingAction?.kind === 'delete' ? 'bg-red-700 hover:bg-red-800' : ''}>{actionLoading ? '处理中…' : '确认操作'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: 'blue' | 'emerald' | 'amber' | 'violet' }) {
  const toneClass = { blue: 'bg-blue-50 text-blue-700', emerald: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', violet: 'bg-violet-50 text-violet-700' }[tone];
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><span className={`grid size-9 place-items-center rounded-xl [&_svg]:size-4 ${toneClass}`}>{icon}</span><span className="text-sm text-slate-500">{label}</span></div><p className="mt-3 text-2xl font-semibold text-slate-950">{value}</p></div>;
}

function RoleBadge({ role }: { role: UserData['role'] }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${role === 'super_admin' ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>{role === 'super_admin' ? '超级管理员' : '普通用户'}</span>;
}

function AccountStatusBadge({ status }: { status: UserData['status'] }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${status === 'active' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}><i className={`size-1.5 rounded-full ${status === 'active' ? 'bg-emerald-500' : 'bg-red-500'}`} />{status === 'active' ? '正常' : '已停用'}</span>;
}
