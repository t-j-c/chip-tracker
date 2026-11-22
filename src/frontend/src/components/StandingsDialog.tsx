import { Trophy } from 'lucide-react';
import type { Player } from '../types/game';
import { computeStandings } from '../lib/standings';
import { cn, formatMoney } from '@/lib/utils';
import { DialogShell } from './DialogShell';
import Avatar from './ui/Avatar';

const RANK_BADGE: Record<number, string> = { 1: 'bg-mustard', 2: 'bg-card', 3: 'bg-[#E8A87C]' };

export default function StandingsDialog({ players, onClose }: { players: Player[]; onClose: () => void }) {
  const standings = computeStandings(players);
  const topStack = standings[0]?.stack ?? 0;
  const tableTotal = standings.reduce((sum, s) => sum + s.stack, 0);
  return (
    <DialogShell title="Standings" testId="standings-dialog" onOpenChange={(open) => !open && onClose()} ariaDescribedBy="standings-description">
      <p id="standings-description" className="mb-3 text-sm text-ink-soft">Chip counts right now. Chips in the pot count once the hand ends.</p>
      <ol className="space-y-2">
        {standings.map(s => (
          <li key={s.playerId} data-testid={`standing-${s.playerId}`} className={cn('flex items-center gap-2.5 rounded-xl border-[3px] border-ink bg-paper py-1.5 pl-1.5 pr-3 shadow-hard-sm', s.isEliminated && 'opacity-50')}>
            <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-ink font-display text-sm text-ink', RANK_BADGE[s.rank] ?? 'bg-paper-deep')}>
              {s.rank === 1 ? <Trophy aria-label="1st" size={14} /> : s.rank}
            </span>
            <Avatar name={s.name} colorIndex={s.seatIndex} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-display text-ink">{s.name}</span>
                <span className="font-display text-ink tabular-nums">{formatMoney(s.stack)}</span>
              </div>
              <div aria-hidden="true" className="mt-1 h-2 overflow-hidden rounded-full border-2 border-ink bg-card">
                <div className="h-full bg-teal" style={{ width: `${topStack > 0 ? (s.stack / topStack) * 100 : 0}%` }} />
              </div>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-center text-xs font-semibold uppercase tracking-wider text-ink-soft tabular-nums">Chips in stacks: {formatMoney(tableTotal)}</p>
    </DialogShell>
  );
}
