import { AlertTriangle } from 'lucide-react';

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-red-900">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">加载失败</p>
          <p className="mt-1 text-sm text-red-800">{message}</p>
        </div>
        {onRetry && (
          <button type="button" onClick={onRetry} className="h-8 rounded-md border border-red-300 bg-white px-3 text-sm font-medium hover:bg-red-100">
            重试
          </button>
        )}
      </div>
    </div>
  );
}
