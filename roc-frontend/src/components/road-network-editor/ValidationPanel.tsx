import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export function ValidationPanel({ errors, expanded }: { errors: string[]; expanded: boolean }) {
  return (
    <div className="border-b border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold text-slate-950"><AlertTriangle className="size-4" />校验</h2>
        {errors.length === 0 && <CheckCircle2 className="size-4 text-emerald-600" />}
      </div>
      {errors.length === 0
        ? <p className="mt-2 text-sm text-emerald-700">当前草稿通过结构校验。</p>
        : <ul className={`mt-2 space-y-1 text-sm text-red-700 ${expanded ? '' : 'max-h-20 overflow-hidden'}`}>{errors.map((message, index) => <li key={`${message}-${index}`}>· {message}</li>)}</ul>}
    </div>
  );
}
