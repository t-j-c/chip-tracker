import { useEffect, useRef, useState } from 'react';
import type { Player } from '../../types/game';
import type { Point } from '../../lib/tableLayout';
import type { ActionBubbleInfo, WinInfo } from '../../hooks/useTableEvents';
import { cn, formatMoney } from '@/lib/utils';
import Avatar from '../ui/Avatar';
import DealerChip from '../ui/DealerChip';
import StatusTag from '../ui/StatusTag';
import ActionBubble from './ActionBubble';
import WinFloat from './WinFloat';

export default function Seat({ player, at, colorIndex, avatarSize, isActive, bubble, win }: {
  player: Player; at: Point; colorIndex: number; avatarSize: 'md' | 'lg'; isActive: boolean; bubble?: ActionBubbleInfo; win?: WinInfo;
}) {
  const [isFolding, setIsFolding] = useState(false);
  const prevFolded = useRef(player.hasFolded);
  useEffect(() => {
    if (!prevFolded.current && player.hasFolded) setIsFolding(true);
    prevFolded.current = player.hasFolded;
  }, [player.hasFolded]);
  const isOut = player.hasFolded || player.isEliminated;
  return (
    <div data-testid={`opponent-panel-${player.playerId}`} className="table-piece absolute z-20 flex w-[78px] -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: `${at.x}%`, top: `${at.y}%` }}>
      <div className={cn('relative', isFolding && 'animate-fold-flip', isOut && 'opacity-50 grayscale')} onAnimationEnd={() => setIsFolding(false)}>
        <div className={cn('rounded-full transition-transform duration-200', isActive && 'turn-ring animate-turn-pulse scale-105', win && 'winner-ring animate-winner-glow')}>
          <Avatar name={player.name} colorIndex={colorIndex} size={avatarSize} />
        </div>
        {player.isDealer && <DealerChip variant="puck" className="absolute -left-2 -top-1" />}
        {isActive && <span aria-hidden="true" className="animate-bob absolute -right-3 -top-2 rounded-full border-2 border-ink bg-card px-1 font-display text-xs leading-4 text-ink">…</span>}
        {player.hasFolded && !player.isEliminated && <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 rounded border-2 border-tomato-deep bg-card/90 px-1 font-display text-[11px] uppercase leading-4 tracking-wider text-tomato-deep">Folded</span>}
      </div>
      <div className="relative z-10 -mt-2 max-w-full rounded-full border-[3px] border-ink bg-card px-2 py-px shadow-hard-sm">
        <div className="truncate text-center font-display text-[13px] leading-4 text-ink">{player.name}</div>
      </div>
      <div className="mt-0.5 rounded-md bg-ink/85 px-1.5 font-display text-xs leading-5 text-paper tabular-nums">{formatMoney(player.stack)}</div>
      <div className="mt-0.5"><StatusTag player={player} /></div>
      {isActive && <span className="sr-only">(to act)</span>}
      {bubble && <ActionBubble key={bubble.key} action={bubble.action} placement={at.y < 30 ? 'below' : 'above'} />}
      {win && <WinFloat key={win.key} amount={win.amount} />}
    </div>
  );
}
