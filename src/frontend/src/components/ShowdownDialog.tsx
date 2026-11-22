import { useState } from 'react';
import type { GameState, Player, PotAward } from '../types/game';
import { cn, formatMoney } from '@/lib/utils';
import { DialogShell } from './DialogShell';
import Avatar from './ui/Avatar';
import RetroButton from './ui/RetroButton';

interface ShowdownDialogProps {
  gameState: GameState;
  onSelectWinner: (winnerId: string) => void;
  onSplitPot: () => void;
  /** Called once all pots have a winner selected (only used when there is more than one pot). */
  onResolveAwards: (awards: PotAward[]) => void;
  /** SD-5: set while the 1.5s celebration plays. Highlights this player, dims others. */
  celebratingWinnerId?: string | null;
}

interface WinnerButtonProps {
  player: Player;
  seatIndex: number;
  onClick: () => void;
  disabled?: boolean;
  state?: 'winner' | 'dimmed' | 'idle';
  testId?: string;
}

/** "Alice wins" — accessible name must start with "{name} wins" (e2e). */
function WinnerButton({ player, seatIndex, onClick, disabled, state = 'idle', testId }: WinnerButtonProps) {
  return (
    <RetroButton
      block
      size="lg"
      tone={state === 'winner' ? 'mustard' : 'cream'}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={cn(
        'justify-start gap-3 py-2 text-left',
        state === 'winner' && 'winner-ring animate-winner-glow scale-105 disabled:opacity-100',
        state === 'dimmed' && 'opacity-40',
      )}
    >
      <Avatar name={player.name} colorIndex={seatIndex} size="md" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{player.name} wins</span>
        <span className="font-sans text-xs font-semibold text-ink-soft tabular-nums">{formatMoney(player.stack)}</span>
      </span>
    </RetroButton>
  );
}

export default function ShowdownDialog({ gameState, onSelectWinner, onSplitPot, onResolveAwards, celebratingWinnerId }: ShowdownDialogProps) {
  const isCelebrating = !!celebratingWinnerId;
  const pots = gameState.pots ?? [];
  const seatIndexOf = (id: string) => gameState.players.findIndex(p => p.playerId === id);

  if (pots.length > 1) {
    return <SidePotStepper gameState={gameState} pots={pots} onResolveAwards={onResolveAwards} seatIndexOf={seatIndexOf} />;
  }

  const activePlayers = gameState.players.filter(p => !p.hasFolded);

  return (
    <DialogShell
      isFixed
      showCloseButton={false}
      centerTitle
      title="Showdown"
      testId="showdown-dialog"
      ariaDescribedBy="showdown-description"
    >
      {isCelebrating ? (
        <p className="animate-pop-in mb-1 text-center font-comic text-3xl tracking-wider text-tomato-deep">Winner!</p>
      ) : (
        <p id="showdown-description" className="mb-1 text-center text-sm font-semibold text-ink-soft">
          Who won the hand?
        </p>
      )}
      <p className="mb-4 text-center font-display text-xl text-ink tabular-nums">
        Pot: {formatMoney(gameState.pot)}
      </p>
      <div className="space-y-3">
        {activePlayers.map(player => (
          <WinnerButton
            key={player.playerId}
            player={player}
            seatIndex={seatIndexOf(player.playerId)}
            onClick={() => !isCelebrating && onSelectWinner(player.playerId)}
            disabled={isCelebrating}
            state={!isCelebrating ? 'idle' : celebratingWinnerId === player.playerId ? 'winner' : 'dimmed'}
          />
        ))}
        <RetroButton block size="md" tone="teal" onClick={onSplitPot} disabled={isCelebrating}>
          Split Pot
        </RetroButton>
      </div>
    </DialogShell>
  );
}

interface SidePotStepperProps {
  gameState: GameState;
  pots: NonNullable<GameState['pots']>;
  onResolveAwards: (awards: PotAward[]) => void;
  seatIndexOf: (id: string) => number;
}

/**
 * Sequential per-pot winner selection for hands with side pots: one screen per pot, only
 * players eligible for that pot are offered as winner buttons (plus a Split option among
 * eligible players). Awards accumulate across steps and are submitted together once every
 * pot has a winner.
 */
function SidePotStepper({ gameState, pots, onResolveAwards, seatIndexOf }: SidePotStepperProps) {
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
    <DialogShell
      isFixed
      showCloseButton={false}
      centerTitle
      title="Showdown"
      testId="showdown-dialog"
      ariaDescribedBy="showdown-side-pot-description"
    >
      <div className="mb-3 flex justify-center gap-1.5" aria-hidden="true">
        {pots.map((_, i) => (
          <span
            key={i}
            className={cn('h-3 w-3 rounded-full border-2 border-ink', i < step ? 'bg-teal' : i === step ? 'bg-mustard' : 'bg-card')}
          />
        ))}
      </div>
      <p
        id="showdown-side-pot-description"
        className="mb-1 text-center text-sm font-semibold text-ink-soft"
        data-testid="pot-step-label"
      >
        Who won the {potLabel.toLowerCase()}? ({step + 1} of {pots.length})
      </p>
      <p className="mb-4 text-center font-display text-xl text-ink tabular-nums">
        {potLabel}: {formatMoney(pot.amount)}
      </p>
      <div className="space-y-3">
        {eligiblePlayers.map(player => (
          <WinnerButton
            key={player.playerId}
            player={player}
            seatIndex={seatIndexOf(player.playerId)}
            testId={`pot-winner-${player.playerId}`}
            onClick={() => submitStep([player.playerId])}
          />
        ))}
        <RetroButton block size="md" tone="teal" data-testid="pot-split" onClick={() => submitStep(eligiblePlayers.map(p => p.playerId))}>
          Split This Pot
        </RetroButton>
      </div>
    </DialogShell>
  );
}
