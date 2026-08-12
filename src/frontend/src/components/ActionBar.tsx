import { useState } from 'react';
import { PokerAction } from '../types/game';
import type { GameState } from '../types/game';
import AmountPicker from './AmountPicker';
import { cn } from '@/lib/utils';

interface ActionBarProps {
  gameState: GameState | null;
  playerId: string | null;
  onAction: (action: PokerAction, amount?: number) => void;
  isYourTurn: boolean;
}

type PickerState = { type: 'bet' | 'raise' } | null;
type FlashColor = 'green' | 'red' | null;

const BTN_BASE = 'min-h-12 rounded-xl font-bold text-sm active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center';

export default function ActionBar({ gameState, playerId, onAction, isYourTurn }: ActionBarProps) {
  const [picker, setPicker] = useState<PickerState>(null);
  const [cooldown, setCooldown] = useState(false);
  const [flash, setFlash] = useState<FlashColor>(null);

  const fireAction = (action: PokerAction, amount?: number) => {
    if (cooldown) return;
    onAction(action, amount);
    setCooldown(true);
    // GP-25: brief color flash
    const color: FlashColor = action === PokerAction.Fold ? 'red' : 'green';
    setFlash(color);
    setTimeout(() => setFlash(null), 300);
    setTimeout(() => setCooldown(false), 500);
  };

  const handIsAcceptingActions = !!gameState?.isHandActive && gameState.phase !== 'Showdown';

  if (!gameState || !playerId || !isYourTurn || !handIsAcceptingActions) {
    return (
      <div
        className="bg-surface-card border-t border-surface-elevated px-4 py-4 text-center text-text-secondary"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        {/* GP-22: subtle pulse animation on waiting text */}
        <span className="animate-pulse">Waiting for your turn...</span>
      </div>
    );
  }

  const player = gameState.players.find(p => p.playerId === playerId);
  if (!player) return null;

  const canCheck = gameState.currentBet === player.currentBet;
  const canBet = gameState.currentBet === 0;
  const canRaise = gameState.currentBet > 0;
  const callAmount = gameState.currentBet - player.currentBet;

  const minBet = gameState.bigBlind;
  const maxBet = player.stack;
  const minRaiseTo = gameState.currentBet + gameState.minRaise;
  const maxRaiseTo = player.stack + player.currentBet;

  if (picker) {
    const isRaise = picker.type === 'raise';
    return (
      // AN-4: slide-up animation when amount picker opens
      <div className="animate-slide-up">
        <AmountPicker
          type={picker.type}
          min={isRaise ? minRaiseTo : minBet}
          max={isRaise ? maxRaiseTo : maxBet}
          step={gameState.bigBlind}
          pot={gameState.pot}
          onConfirm={(amount) => {
            setPicker(null);
            fireAction(isRaise ? PokerAction.Raise : PokerAction.Bet, amount);
          }}
          onCancel={() => setPicker(null)}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'border-t border-surface-elevated px-4 pt-3 transition-colors duration-300',
        flash === 'green' && 'bg-accent-primary/20',
        flash === 'red' && 'bg-accent-danger/20',
        !flash && 'bg-surface-card'
      )}
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      data-testid="action-bar"
    >
      <p className="text-center text-xs text-text-secondary mb-3 font-medium">Your Turn - Choose Action</p>

      {/* Row 1: Fold + Check/Call */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <button
          onClick={() => fireAction(PokerAction.Fold)}
          disabled={cooldown}
          aria-label="Fold"
          className={cn(BTN_BASE, 'bg-accent-danger text-white hover:bg-accent-danger/90')}
        >
          Fold
        </button>

        {canCheck ? (
          <button
            onClick={() => fireAction(PokerAction.Check)}
            disabled={cooldown}
            aria-label="Check"
            className={cn(BTN_BASE, 'bg-accent-primary text-white hover:bg-accent-primary/90')}
          >
            Check
          </button>
        ) : (
          <button
            onClick={() => fireAction(PokerAction.Call)}
            disabled={cooldown}
            aria-label={`Call ${callAmount.toLocaleString()} dollars`}
            className={cn(BTN_BASE, 'bg-accent-info text-white hover:bg-accent-info/90')}
          >
            Call ${callAmount.toLocaleString()}
          </button>
        )}
      </div>

      {/* Row 2: Bet/Raise + All-In */}
      <div className="grid grid-cols-2 gap-3">
        {canBet ? (
          <button
            onClick={() => setPicker({ type: 'bet' })}
            disabled={cooldown}
            aria-label="Bet"
            className={cn(BTN_BASE, 'bg-accent-bet text-white hover:bg-accent-bet/90')}
          >
            Bet
          </button>
        ) : canRaise ? (
          <button
            onClick={() => setPicker({ type: 'raise' })}
            disabled={cooldown}
            aria-label="Raise"
            className={cn(BTN_BASE, 'bg-accent-raise text-white hover:bg-accent-raise/90')}
          >
            Raise
          </button>
        ) : (
          <div />
        )}

        {/* GP-24: show remaining stack on All-In button */}
        <button
          onClick={() => fireAction(PokerAction.AllIn)}
          disabled={cooldown}
          aria-label={`All in ${player.stack.toLocaleString()} dollars`}
          className={cn(BTN_BASE, 'bg-accent-warning text-text-on-light hover:bg-accent-warning/90 flex flex-col gap-0 leading-tight')}
        >
          <span className="text-xs font-bold">All-In</span>
          <span className="text-[10px] font-mono opacity-80">${player.stack.toLocaleString()}</span>
        </button>
      </div>
    </div>
  );
}

