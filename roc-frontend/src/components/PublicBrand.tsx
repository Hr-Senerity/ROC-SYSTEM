import { Zap } from 'lucide-react';

interface PublicBrandProps {
  compact?: boolean;
  inverse?: boolean;
}

export function PublicBrand({ compact = false, inverse = false }: PublicBrandProps) {
  return (
    <span className="inline-flex items-center gap-2.5" aria-label="ROC Platform">
      <span
        className={`grid ${compact ? 'size-8 rounded-[10px]' : 'size-10 rounded-[13px]'} place-items-center shadow-[0_10px_24px_rgba(47,107,255,.22)] ${inverse ? 'bg-white text-[#2f6bff]' : 'bg-[#2f6bff] text-white'}`}
      >
        <Zap className={compact ? 'size-4' : 'size-5'} strokeWidth={2.4} />
      </span>
      <span className={`${compact ? 'text-sm' : 'text-base'} font-semibold tracking-[-0.02em] ${inverse ? 'text-white' : 'text-[#101522]'}`}>
        ROC <span className={inverse ? 'text-white/65' : 'text-[#7b8292]'}>Platform</span>
      </span>
    </span>
  );
}
