import { cn } from '@/lib/utils';

interface DealerChipProps {
  variant: 'puck' | 'pill';
  className?: string;
}

export default function DealerChip({ variant, className }: DealerChipProps) {
  if (variant === 'puck') {
    return (
      <span
        role="img"
        aria-label="Dealer"
        className={cn(
          'inline-flex h-6 w-6 items-center justify-center rounded-full border-[3px] border-ink bg-card font-display text-xs leading-none text-ink shadow-hard-sm',
          className,
        )}
      >
        D
      </span>
    );
  }
  return (
    <span
      aria-label="Dealer"
      className={cn(
        'inline-flex items-center gap-1 rounded-full border-2 border-ink bg-card px-2 py-px font-display text-xs leading-4 text-ink',
        className,
      )}
    >
      <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full border-2 border-ink bg-tomato" />
      Dealer
    </span>
  );
}
