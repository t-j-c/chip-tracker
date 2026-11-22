import type { PokerAction } from '../../types/game';
import { cn } from '@/lib/utils';

const BUBBLES: Record<PokerAction, { text: string; className: string }> = {
  Fold: { text: 'Fold!', className: 'bg-tomato text-ink' },
  Check: { text: 'Check!', className: 'bg-teal text-ink' },
  Call: { text: 'Call!', className: 'bg-royal text-paper' },
  Bet: { text: 'Bet!', className: 'bg-mustard text-ink' },
  Raise: { text: 'Raise!', className: 'bg-mustard text-ink' },
  AllIn: { text: 'All-in!', className: 'bg-grape text-paper' },
};

export default function ActionBubble({ action, placement }: { action: PokerAction; placement: 'above' | 'below' }) {
  const { text, className } = BUBBLES[action];
  return (
    <div aria-hidden="true" className={cn('pointer-events-none absolute left-1/2 z-40 -translate-x-1/2', placement === 'above' ? 'bottom-full mb-1' : 'top-full mt-1')}>
      <div className={cn('keep-visible-reduced animate-bubble relative whitespace-nowrap rounded-xl border-[3px] border-ink px-2.5 py-0.5 font-comic text-xl leading-tight tracking-wider shadow-hard-sm', className)}>
        {text}
        <span className={cn('absolute left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-ink', placement === 'above' ? '-bottom-[7px] border-b-[3px] border-r-[3px]' : '-top-[7px] border-l-[3px] border-t-[3px]', className)} />
      </div>
    </div>
  );
}
