import type { Player } from '../../types/game';
import { cn } from '@/lib/utils';

const TAG = 'inline-flex items-center rounded-full border-2 border-ink px-1.5 py-px font-display text-[11px] uppercase leading-4 tracking-wide';

export default function StatusTag({ player, showFolded = false }: { player: Player; showFolded?: boolean }) {
  if (player.isEliminated) return <span className={cn(TAG, 'bg-ink text-paper')}>Eliminated</span>;
  if (player.isAwaitingRebuy) return <span className={cn(TAG, 'bg-mustard text-ink')}>Deciding</span>;
  if (player.isAllIn) return <span className={cn(TAG, 'bg-grape text-paper')}>All In</span>;
  if (showFolded && player.hasFolded) return <span className={cn(TAG, 'bg-tomato text-ink')}>Folded</span>;
  return null;
}
