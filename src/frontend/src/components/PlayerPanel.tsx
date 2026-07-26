import { useState, useRef, useEffect } from 'react';
import type { Player } from '../types/game';
import { cn } from '@/lib/utils';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';

interface PlayerPanelProps {
  player: Player;
  isActivePlayer: boolean;
  variant?: 'opponent' | 'self';
}

function getInitial(name: string) {
  return name.charAt(0).toUpperCase();
}

function DealerBadge({ small = false }: { small?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full font-bold bg-accent-warning text-text-on-light',
        small ? 'w-4 h-4 text-[8px]' : 'px-2 py-0.5 text-xs'
      )}
      aria-label="Dealer"
    >
      {small ? 'D' : '🔴 Dealer'}
    </span>
  );
}

export default function PlayerPanel({ player, isActivePlayer, variant = 'opponent' }: PlayerPanelProps) {
  const animatedStack = useAnimatedNumber(player.stack);

  // AN-9: fold card flip animation (opponent variant)
  const [isFolding, setIsFolding] = useState(false);
  const prevHasFoldedRef = useRef(player.hasFolded);
  useEffect(() => {
    if (!prevHasFoldedRef.current && player.hasFolded) {
      setIsFolding(true);
    }
    prevHasFoldedRef.current = player.hasFolded;
  }, [player.hasFolded]);

  if (variant === 'self') {
    return (
      <div
        className={cn(
          'rounded-xl p-4 bg-surface-card border-t-4 transition-all',
          isActivePlayer ? 'border-gold' : 'border-surface-elevated'
        )}
        data-testid="self-player-panel"
      >
        <div className="flex items-center gap-3 mb-2">
          <div
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold text-white flex-shrink-0',
              isActivePlayer ? 'bg-accent-primary' : 'bg-surface-elevated'
            )}
          >
            {getInitial(player.name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-text-primary truncate">{player.name}</div>
            {player.isDealer && <DealerBadge />}
          </div>
          {player.isAllIn && (
            <span className="text-xs bg-accent-danger uppercase tracking-wide text-white px-2 py-0.5 rounded-full font-bold animate-pulse">
              All In
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-text-secondary">Stack:</span>
          <span className="font-mono text-3xl font-bold text-text-primary">
            ${animatedStack.toLocaleString()}
          </span>
        </div>
        {player.currentBet > 0 && (
          <div className="text-sm text-text-secondary mt-1">
            Your bet: <span className="text-text-primary font-semibold font-mono">${player.currentBet.toLocaleString()}</span>
          </div>
        )}
        {player.hasFolded && (
          <div className="text-accent-danger font-semibold text-sm mt-1">Folded</div>
        )}
      </div>
    );
  }

  // Opponent variant — compact horizontal-scroll card
  return (
    <div
      className={cn(
        'relative flex-shrink-0 w-28 p-3 rounded-xl bg-surface-card flex flex-col items-center gap-1 transition-all',
        player.hasFolded && !isFolding && 'opacity-40',
        isFolding && 'animate-fold-flip'
      )}
      onAnimationEnd={() => setIsFolding(false)}
      data-testid={`opponent-panel-${player.playerId}`}
    >
      {/* Avatar */}
      <div
        className={cn(
          'w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white ring-2 transition-all',
          isActivePlayer && 'ring-gold animate-gold-glow',
          player.isAllIn && !player.hasFolded && !isActivePlayer && 'ring-accent-danger animate-pulse',
          !isActivePlayer && !player.isAllIn && 'ring-surface-elevated',
          player.isAllIn ? 'bg-accent-danger' : isActivePlayer ? 'bg-accent-primary' : 'bg-surface-elevated'
        )}
      >
        {getInitial(player.name)}
      </div>

      <div className="text-xs text-text-primary font-semibold truncate w-full text-center leading-tight">
        {player.name}
      </div>

      {player.isDealer && <DealerBadge small />}

      <div className="text-xs text-text-secondary font-mono">
        <span className="text-[10px] text-text-secondary">Stack:</span> ${player.stack.toLocaleString()}
      </div>

      {player.currentBet > 0 && (
        <div className="text-[10px] text-gold font-mono font-semibold">
          Bet: ${player.currentBet}
        </div>
      )}

      {player.isAllIn && (
        <span className="text-[10px] bg-accent-danger text-white px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide">
          All In
        </span>
      )}

      {/* Folded overlay text */}
      {player.hasFolded && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl">
          <span className="text-[9px] font-bold text-text-secondary tracking-widest uppercase rotate-12 opacity-80">
            Folded
          </span>
        </div>
      )}
    </div>
  );
}
