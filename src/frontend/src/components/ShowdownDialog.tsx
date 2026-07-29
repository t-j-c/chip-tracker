import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { GameState, PotAward } from '../types/game';
import { getAvatarColor, cn } from '@/lib/utils';

interface ShowdownDialogProps {
  gameState: GameState;
  onSelectWinner: (winnerId: string) => void;
  onSplitPot: () => void;
  /** Called once all pots have a winner selected (only used when there is more than one pot). */
  onResolveAwards: (awards: PotAward[]) => void;
  /** SD-5: set while confetti plays (1.5s). Highlights this player, dims others. */
  celebratingWinnerId?: string | null;
}

export default function ShowdownDialog({ gameState, onSelectWinner, onSplitPot, onResolveAwards, celebratingWinnerId }: ShowdownDialogProps) {
  const isCelebrating = !!celebratingWinnerId;
  const pots = gameState.pots ?? [];

  if (pots.length > 1) {
    return (
      <SidePotStepper
        gameState={gameState}
        pots={pots}
        onResolveAwards={onResolveAwards}
      />
    );
  }

  const activePlayers = gameState.players.filter(p => !p.hasFolded);

  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm p-6 rounded-2xl bg-surface-elevated shadow-2xl"
          aria-describedby="showdown-description"
        >
          <Dialog.Title className="text-2xl font-bold uppercase tracking-widest text-gold text-center mb-1">
            Showdown
          </Dialog.Title>
          {isCelebrating ? (
            <p className="text-gold font-bold text-center text-lg animate-pulse mb-1">🎉 Winner! 🎉</p>
          ) : (
            <p
              id="showdown-description"
              className="text-text-secondary text-center text-sm mb-1"
            >
              Who won the hand?
            </p>
          )}
          <p className="text-center text-text-primary font-mono font-bold text-lg mb-5">
            Pot: ${gameState.pot.toLocaleString()}
          </p>
          <div className="space-y-3">
            {activePlayers.map((player, idx) => (
              <button
                key={player.playerId}
                onClick={() => !isCelebrating && onSelectWinner(player.playerId)}
                disabled={isCelebrating}
                className={cn(
                  'w-full text-white font-bold py-4 px-4 rounded-xl transition-all text-left flex items-center gap-3 bg-surface-card border-2',
                  isCelebrating && celebratingWinnerId === player.playerId
                    ? 'border-gold bg-gold/10 scale-105'
                    : isCelebrating
                    ? 'border-transparent opacity-40'
                    : 'border-transparent hover:opacity-90 active:scale-95 hover:border-gold cursor-pointer'
                )}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0 ${getAvatarColor(idx)}`}>
                  {player.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-bold text-text-primary">{player.name} wins</div>
                  <div className="text-xs text-text-secondary font-mono">${player.stack.toLocaleString()}</div>
                </div>
              </button>
            ))}
            <button
              onClick={onSplitPot}
              disabled={isCelebrating}
              className={cn(
                'w-full border-2 border-surface-card text-text-primary font-bold py-3 px-4 rounded-xl transition-all',
                isCelebrating ? 'opacity-30 cursor-not-allowed' : 'hover:bg-surface-card active:scale-95'
              )}
            >
              Split Pot
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface SidePotStepperProps {
  gameState: GameState;
  pots: NonNullable<GameState['pots']>;
  onResolveAwards: (awards: PotAward[]) => void;
}

/**
 * Sequential per-pot winner selection for hands with side pots: one screen per pot, only
 * players eligible for that pot are offered as winner buttons (plus a Split option among
 * eligible players). Awards accumulate across steps and are submitted together once every
 * pot has a winner.
 */
function SidePotStepper({ gameState, pots, onResolveAwards }: SidePotStepperProps) {
  const [step, setStep] = useState(0);
  const [awards, setAwards] = useState<PotAward[]>([]);

  const pot = pots[step];
  const eligiblePlayers = gameState.players.filter(p => pot.eligiblePlayerIds.includes(p.playerId));
  const potLabel = step === 0 ? 'Main Pot' : `Side Pot ${step}`;

  const submitStep = (winnerPlayerIds: string[]) => {
    const nextAwards = [...awards, { potIndex: step, winnerPlayerIds }];
    if (step + 1 < pots.length) {
      setAwards(nextAwards);
      setStep(step + 1);
    } else {
      onResolveAwards(nextAwards);
    }
  };

  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm p-6 rounded-2xl bg-surface-elevated shadow-2xl"
          aria-describedby="showdown-side-pot-description"
        >
          <Dialog.Title className="text-2xl font-bold uppercase tracking-widest text-gold text-center mb-1">
            Showdown
          </Dialog.Title>
          <p
            id="showdown-side-pot-description"
            className="text-text-secondary text-center text-sm mb-1"
            data-testid="pot-step-label"
          >
            Who won the {potLabel.toLowerCase()}? ({step + 1} of {pots.length})
          </p>
          <p className="text-center text-text-primary font-mono font-bold text-lg mb-5">
            {potLabel}: ${pot.amount.toLocaleString()}
          </p>
          <div className="space-y-3">
            {eligiblePlayers.map((player, idx) => (
              <button
                key={player.playerId}
                data-testid={`pot-winner-${player.playerId}`}
                onClick={() => submitStep([player.playerId])}
                className="w-full text-white font-bold py-4 px-4 rounded-xl transition-all text-left flex items-center gap-3 bg-surface-card border-2 border-transparent hover:opacity-90 active:scale-95 hover:border-gold cursor-pointer"
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0 ${getAvatarColor(idx)}`}>
                  {player.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-bold text-text-primary">{player.name} wins</div>
                  <div className="text-xs text-text-secondary font-mono">${player.stack.toLocaleString()}</div>
                </div>
              </button>
            ))}
            <button
              data-testid="pot-split"
              onClick={() => submitStep(eligiblePlayers.map(p => p.playerId))}
              className="w-full border-2 border-surface-card text-text-primary font-bold py-3 px-4 rounded-xl transition-all hover:bg-surface-card active:scale-95"
            >
              Split This Pot
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
