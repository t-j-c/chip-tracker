import { useCallback, useEffect, useState } from 'react';
import { PokerAction } from '../types/game';
import type { GameState } from '../types/game';
import AmountPicker from './AmountPicker';
import RetroButton from './ui/RetroButton';
import { cn, formatMoney } from '@/lib/utils';
import { PRE_ACTION_KINDS, PRE_ACTION_LABELS, resolvePreAction, type PreActionKind } from '../lib/preActions';

interface ActionBarProps {
  gameState: GameState | null;
  playerId: string | null;
  onAction: (action: PokerAction, amount?: number) => void;
  isYourTurn: boolean;
}

type PickerState = { type: 'bet' | 'raise' } | null;
type FlashColor = 'green' | 'red' | null;

const DOCK = 'border-t-[3px] border-ink bg-paper-deep px-3 pt-2';
const SAFE_BOTTOM = { paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' };
const ACTION_BTN = 'h-16 flex-col gap-0 px-1 text-base uppercase';

function Kbd({ children }: { children: string }) {
  return (
    <kbd
      aria-hidden="true"
      className="absolute right-1 top-1 hidden h-4 min-w-4 items-center justify-center rounded border border-current px-0.5 font-sans text-[9px] leading-none opacity-70 pointer-fine:inline-flex"
    >
      {children}
    </kbd>
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable
    || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
    || target.getAttribute('role') === 'slider';
}

export default function ActionBar({ gameState, playerId, onAction, isYourTurn }: ActionBarProps) {
  const [picker, setPicker] = useState<PickerState>(null);
  const [cooldown, setCooldown] = useState(false);
  const [flash, setFlash] = useState<FlashColor>(null);
  // A queued pre-action only applies to the street (hand + phase) it was chosen on.
  const [preAction, setPreAction] = useState<{ kind: PreActionKind; street: string } | null>(null);

  const player = gameState?.players.find(p => p.playerId === playerId) ?? null;
  const handIsAcceptingActions = !!gameState?.isHandActive && gameState.phase !== 'Showdown';
  const canAct = !!gameState && !!player && isYourTurn && handIsAcceptingActions;
  const canCheck = !!gameState && !!player && gameState.currentBet === player.currentBet;
  const handNumber = gameState?.recentActivity?.at(-1)?.handNumber ?? 0;
  const street = `${handNumber}:${gameState?.phase ?? ''}`;
  const activePreAction = preAction && preAction.street === street ? preAction.kind : null;

  const fireAction = useCallback((action: PokerAction, amount?: number) => {
    if (cooldown) return;
    onAction(action, amount);
    setCooldown(true);
    setFlash(action === PokerAction.Fold ? 'red' : 'green');
    setTimeout(() => setFlash(null), 300);
    setTimeout(() => setCooldown(false), 500);
  }, [cooldown, onAction]);

  // Fire a queued pre-action the moment the turn arrives.
  useEffect(() => {
    if (!canAct || !activePreAction) return;
    setPreAction(null);
    const action = resolvePreAction(activePreAction, canCheck);
    if (action) fireAction(action);
  }, [canAct, activePreAction, canCheck, fireAction]);

  // Desktop hotkeys: F fold, C check/call, B/R open the sizing picker, Esc closes it.
  useEffect(() => {
    if (!canAct || !gameState) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const key = e.key.toLowerCase();
      if (picker) {
        if (key === 'escape') setPicker(null);
        return;
      }
      if (key === 'f') fireAction(PokerAction.Fold);
      else if (key === 'c') fireAction(canCheck ? PokerAction.Check : PokerAction.Call);
      else if (key === 'b' || key === 'r') setPicker({ type: gameState.currentBet === 0 ? 'bet' : 'raise' });
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canAct, canCheck, picker, fireAction, gameState]);

  if (!gameState || !playerId || !player || !canAct) {
    const showPreActions = !!player && handIsAcceptingActions && !isYourTurn
      && !player.hasFolded && !player.isAllIn && !player.isEliminated && !player.isAwaitingRebuy;
    return (
      <div className={cn(DOCK, 'text-center')} style={SAFE_BOTTOM}>
        <p className="font-display text-base text-ink-soft">
          {/* E2E waits for this exact text. */}
          <span className="animate-pulse">Waiting for your turn...</span>
        </p>
        {showPreActions && (
          <div role="group" aria-label="Pre-select your next action" className="mt-2 grid grid-cols-3 gap-2">
            {PRE_ACTION_KINDS.map(kind => {
              const checked = activePreAction === kind;
              return (
                <button
                  key={kind}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  data-testid={`pre-action-${kind}`}
                  onClick={() => setPreAction(checked ? null : { kind, street })}
                  className={cn('retro-btn min-h-11 gap-1 px-1 text-xs', checked ? 'bg-mustard text-ink' : 'bg-card text-ink')}
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 border-ink bg-card text-[10px] leading-none"
                  >
                    {checked ? '✓' : ''}
                  </span>
                  {PRE_ACTION_LABELS[kind]}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const canBet = gameState.currentBet === 0;
  const callAmount = gameState.currentBet - player.currentBet;
  const minBet = gameState.bigBlind;
  const maxBet = player.stack;
  const minRaiseTo = gameState.currentBet + gameState.minRaise;
  const maxRaiseTo = player.stack + player.currentBet;

  if (picker) {
    const isRaise = picker.type === 'raise';
    return (
      <div className="animate-slide-up">
        <AmountPicker
          type={picker.type}
          min={isRaise ? minRaiseTo : minBet}
          max={isRaise ? maxRaiseTo : maxBet}
          step={gameState.bigBlind}
          pot={gameState.pot}
          currentBet={gameState.currentBet}
          isPreFlop={gameState.phase === 'PreFlop'}
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
        DOCK,
        'transition-colors duration-300',
        flash === 'green' && 'bg-teal/50',
        flash === 'red' && 'bg-tomato/50',
      )}
      style={SAFE_BOTTOM}
      data-testid="action-bar"
    >
      {/* E2E waits for this exact text. */}
      <p className="animate-pop-in mx-auto mb-2 w-fit -rotate-1 rounded-full border-[3px] border-ink bg-mustard px-4 py-0.5 text-center font-display text-sm uppercase tracking-wide text-ink shadow-hard-sm">
        Your Turn - Choose Action
      </p>

      <div className="grid grid-cols-4 gap-2">
        <RetroButton
          onClick={() => fireAction(PokerAction.Fold)}
          disabled={cooldown}
          aria-label="Fold"
          tone={canCheck ? 'cream' : 'tomato'}
          className={cn(ACTION_BTN, 'relative')}
        >
          Fold
          <Kbd>F</Kbd>
        </RetroButton>
        {canCheck ? (
          <RetroButton
            onClick={() => fireAction(PokerAction.Check)}
            disabled={cooldown}
            aria-label="Check"
            tone="teal"
            className={cn(ACTION_BTN, 'relative')}
          >
            Check
            <Kbd>C</Kbd>
          </RetroButton>
        ) : (
          <RetroButton
            onClick={() => fireAction(PokerAction.Call)}
            disabled={cooldown}
            aria-label={`Call ${callAmount.toLocaleString()} dollars`}
            tone="royal"
            className={cn(ACTION_BTN, 'relative')}
          >
            <span>Call</span>
            <span className="text-xs normal-case tabular-nums">{formatMoney(callAmount)}</span>
            <Kbd>C</Kbd>
          </RetroButton>
        )}

        <RetroButton
          onClick={() => setPicker({ type: canBet ? 'bet' : 'raise' })}
          disabled={cooldown}
          aria-label={canBet ? 'Bet' : 'Raise'}
          tone="mustard"
          className={cn(ACTION_BTN, 'relative')}
        >
          {canBet ? 'Bet' : 'Raise'}
          <Kbd>{canBet ? 'B' : 'R'}</Kbd>
        </RetroButton>

        <RetroButton
          onClick={() => fireAction(PokerAction.AllIn)}
          disabled={cooldown}
          aria-label={`All in ${player.stack.toLocaleString()} dollars`}
          tone="grape"
          className={ACTION_BTN}
        >
          <span>All-In</span>
          <span className="text-xs normal-case tabular-nums">{formatMoney(player.stack)}</span>
        </RetroButton>
      </div>
    </div>
  );
}
