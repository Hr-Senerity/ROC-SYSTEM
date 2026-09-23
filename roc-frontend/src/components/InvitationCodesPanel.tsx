import { useCallback, useEffect, useState } from 'react';
import { Ban, Copy, KeyRound, Plus, RefreshCw } from 'lucide-react';
import { useAuth } from '../app/auth/AuthProvider';
import { apiRequest } from '../shared/api/client';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from './ui/alert-dialog';
import { Button } from './ui/button';

interface InvitationCode {
  id: string;
  code: string;
  status: 'available' | 'used' | 'revoked';
  created_at: string;
  used_at?: string | null;
  revoked_at?: string | null;
  created_by_username?: string | null;
  used_by_username?: string | null;
}

interface InvitationListResponse {
  invitation_codes?: InvitationCode[];
  total?: number;
  page?: number;
  limit?: number;
}

interface InvitationCreateResponse {
  invitation_code?: InvitationCode;
}

const PAGE_SIZE = 10;

export function InvitationCodesPanel() {
  const { token } = useAuth();
  const [invitations, setInvitations] = useState<InvitationCode[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pendingRevoke, setPendingRevoke] = useState<InvitationCode | null>(null);

  const loadInvitations = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (statusFilter) params.set('status', statusFilter);
      const response = await apiRequest<InvitationListResponse>(`/api/admin/invitation-codes?${params}`, { token });
      setInvitations(response.invitation_codes || []);
      setTotal(response.total || 0);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '无法加载邀请码');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, token]);

  useEffect(() => { void loadInvitations(); }, [loadInvitations]);

  const generateInvitation = async () => {
    if (mutating) return;
    setMutating(true);
    setError('');
    setNotice('');
    try {
      const response = await apiRequest<InvitationCreateResponse>('/api/admin/invitation-codes', {
        method: 'POST', token,
      });
      const createdInvitation = response.invitation_code;
      if (!createdInvitation) throw new Error('服务器未返回邀请码');
      setNotice(`已生成邀请码 ${createdInvitation.code}，每个邀请码只能注册一个账户。`);
      if (page !== 1) setPage(1);
      else await loadInvitations();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '生成邀请码失败');
    } finally {
      setMutating(false);
    }
  };

  const copyInvitation = async (code: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(code);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = code;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();
        if (!copied) throw new Error('Copy command failed');
      }
      setNotice(`已复制邀请码 ${code}`);
      setError('');
    } catch {
      setError('复制失败，请手动选择邀请码');
    }
  };

  const revokeInvitation = async () => {
    if (!pendingRevoke || mutating) return;
    setMutating(true);
    setError('');
    setNotice('');
    try {
      await apiRequest(`/api/admin/invitation-codes/${pendingRevoke.id}`, {
        method: 'DELETE', token,
      });
      setNotice(`邀请码 ${pendingRevoke.code} 已撤销`);
      setPendingRevoke(null);
      await loadInvitations();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '撤销邀请码失败');
      setPendingRevoke(null);
    } finally {
      setMutating(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    if (!loading && page > totalPages) setPage(totalPages);
  }, [loading, page, totalPages]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><KeyRound className="size-5 text-indigo-600" /><h2 className="font-semibold text-slate-950">注册邀请码</h2></div>
          <p className="mt-1 text-sm text-slate-500">生成 5 位数字与大写字母组合。邀请码使用一次后自动失效。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={statusFilter}
            onChange={(event) => { setPage(1); setStatusFilter(event.target.value); }}
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
            aria-label="筛选邀请码状态"
          >
            <option value="">全部状态</option>
            <option value="available">可使用</option>
            <option value="used">已使用</option>
            <option value="revoked">已撤销</option>
          </select>
          <Button variant="outline" size="sm" disabled={loading || mutating} onClick={() => void loadInvitations()}><RefreshCw />刷新</Button>
          <Button size="sm" disabled={mutating} onClick={() => void generateInvitation()}><Plus />随机生成</Button>
        </div>
      </div>

      {(error || notice) && <div className={`border-b px-5 py-3 text-sm ${error ? 'border-red-100 bg-red-50 text-red-700' : 'border-emerald-100 bg-emerald-50 text-emerald-700'}`}>{error || notice}</div>}

      <div className="max-h-[360px] overflow-auto">
        {loading && <p className="p-8 text-center text-sm text-slate-500">正在加载邀请码…</p>}
        {!loading && invitations.length === 0 && <p className="p-8 text-center text-sm text-slate-500">尚未生成邀请码</p>}
        {!loading && invitations.map((invitation) => (
          <div key={invitation.id} className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-base font-semibold tracking-[0.18em] text-slate-950">{invitation.code}</code>
                <InvitationStatus status={invitation.status} />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {invitation.created_by_username ? `${invitation.created_by_username} · ` : ''}
                生成于 {new Date(invitation.created_at).toLocaleString('zh-CN')}
                {invitation.status === 'used' && invitation.used_by_username ? ` · 已由 ${invitation.used_by_username} 使用` : ''}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" onClick={() => void copyInvitation(invitation.code)}><Copy />复制</Button>
              {invitation.status === 'available' && <Button variant="outline" size="sm" className="text-red-700" disabled={mutating} onClick={() => setPendingRevoke(invitation)}><Ban />撤销</Button>}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-500">
        <span>共 {total} 个邀请码</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>上一页</Button>
          <span>{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>下一页</Button>
        </div>
      </div>

      <AlertDialog open={Boolean(pendingRevoke)} onOpenChange={(open) => { if (!open && !mutating) setPendingRevoke(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>撤销邀请码“{pendingRevoke?.code}”？</AlertDialogTitle>
            <AlertDialogDescription>撤销后不能恢复，也不能再用于创建账户。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutating}>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-red-700 hover:bg-red-800" disabled={mutating} onClick={(event) => { event.preventDefault(); void revokeInvitation(); }}>{mutating ? '正在撤销…' : '确认撤销'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InvitationStatus({ status }: { status: InvitationCode['status'] }) {
  const style = {
    available: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    used: 'border-slate-200 bg-slate-50 text-slate-600',
    revoked: 'border-red-200 bg-red-50 text-red-700',
  }[status];
  const label = { available: '可使用', used: '已使用', revoked: '已撤销' }[status];
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${style}`}>{label}</span>;
}
