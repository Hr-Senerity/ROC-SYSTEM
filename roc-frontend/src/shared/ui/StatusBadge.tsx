type StatusKind = 'active' | 'online' | 'offline' | 'error' | 'inactive';

const styles: Record<StatusKind, string> = {
  active: 'bg-green-50 text-green-700 ring-green-600/20',
  online: 'bg-green-50 text-green-700 ring-green-600/20',
  offline: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  error: 'bg-red-50 text-red-700 ring-red-600/20',
  inactive: 'bg-slate-100 text-slate-700 ring-slate-500/20',
};

export function StatusBadge({ status, label }: { status: StatusKind; label: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${styles[status]}`}>{label}</span>;
}
