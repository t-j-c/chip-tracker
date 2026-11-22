import type { Player } from '../../types/game';
import type { ActionBubbleInfo, WinInfo } from '../../hooks/useTableEvents';
import { useAnimatedNumber } from '../../hooks/useAnimatedNumber';
import { cn, formatMoney } from '@/lib/utils';
import Avatar from '../ui/Avatar';
import DealerChip from '../ui/DealerChip';
import StatusTag from '../ui/StatusTag';
import ActionBubble from './ActionBubble';
import WinFloat from './WinFloat';

export default function HeroPanel({ player, colorIndex, isActive, bubble, win }: {
  player: Player; colorIndex: number; isActive: boolean; bubble?: ActionBubbleInfo; win?: WinInfo;
}) {
  const animatedStack = useAnimatedNumber(player.stack);
  const isOut = player.hasFolded || player.isEliminated;
  return (
    <div data-testid="self-player-panel" className={cn('retro-panel relative mx-3 mb-2 flex items-center gap-3 px-3 py-2 transition-colors duration-300', isActive && 'bg-[#FFF1C7]')}>
      <div className={cn('shrink-0 rounded-full', isActive && 'turn-ring animate-turn-pulse', win && 'winner-ring animate-winner-glow', isOut && 'opacity-50 grayscale')}>
        <Avatar name={player.name} colorIndex={colorIndex} size="xl" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-display text-lg leading-tight text-ink">{player.name}</span>
          <span className="shrink-0 rounded-full border-2 border-ink bg-bubblegum px-1.5 font-display text-[10px] uppercase leading-4 tracking-wider text-ink">You</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {player.isDealer && <DealerChip variant="pill" />}
          <StatusTag player={player} showFolded />
        </div>
        {player.currentBet > 0 && <div className="mt-0.5 text-sm font-medium text-ink-soft">Your bet: <span className="font-display text-ink tabular-nums">{formatMoney(player.currentBet)}</span></div>}
      </div>
      <div className="shrink-0 text-right">
        <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-soft">Stack:</span>
        <span className="block font-display text-3xl leading-none text-ink tabular-nums">{formatMoney(animatedStack)}</span>
      </div>
      {isActive && <span className="sr-only">(your turn)</span>}
      {bubble && <ActionBubble key={bubble.key} action={bubble.action} placement="above" />}
      {win && <WinFloat key={win.key} amount={win.amount} />}
    </div>
  );
}
