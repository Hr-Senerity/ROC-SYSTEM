import { GitBranch, History, Loader2 } from 'lucide-react';
import type { RoadNetworkRevision } from '../../features/road-network/model';
import { formatKilobytes } from '../../shared/formatKilobytes';
import { Button } from '../ui/button';

interface VersionPanelProps {
  revisions: RoadNetworkRevision[];
  currentRevisionId: string | null;
  loadingRevisionId: string | null;
  onLoad: (revision: RoadNetworkRevision) => void;
}

export function VersionPanel({ revisions, currentRevisionId, loadingRevisionId, onLoad }: VersionPanelProps) {
  return (
    <div className="p-4">
      <h2 className="flex items-center gap-2 font-semibold text-slate-950"><History className="size-4" />版本历史</h2>
      {revisions.length === 0
        ? <p className="mt-3 text-sm text-slate-500">尚未保存任何不可变版本。</p>
        : (
          <ol className="mt-3 space-y-2">
            {revisions.map((revision) => (
              <li key={revision.id} className={`rounded-md border p-3 ${currentRevisionId === revision.id ? 'border-blue-300 bg-blue-50' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-900">v{revision.version}</span>
                  {currentRevisionId === revision.id && <span className="text-xs font-medium text-blue-700">已加载</span>}
                </div>
                <p className="mt-1 text-xs text-slate-500">{new Date(revision.createdAt).toLocaleString('zh-CN')} · {formatKilobytes(revision.byteSize)}</p>
                <p className="mt-1 truncate font-mono text-[11px] text-slate-400" title={revision.sha256}>{revision.sha256}</p>
                <Button variant="ghost" size="sm" className="mt-2 w-full" disabled={loadingRevisionId === revision.id} onClick={() => onLoad(revision)}>
                  {loadingRevisionId === revision.id ? <Loader2 className="animate-spin" /> : <GitBranch />}加载此版本
                </Button>
              </li>
            ))}
          </ol>
        )}
    </div>
  );
}
