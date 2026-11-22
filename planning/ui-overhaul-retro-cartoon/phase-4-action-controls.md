# Phase 4: Action Controls

**Goal:** A thumb-zone action dock in the style of the best mobile poker clients.

- **One row of four big buttons:** Fold · Check or Call $X · Bet or Raise · All-In $X.
  - Fold turns the neutral cream style when checking is free (fold safety).
  - Desktop hotkeys: **F** fold, **C** check/call, **B/R** open sizing, **Esc** close sizing. Hints show only on fine pointers.
- **Pre-action checkboxes** while waiting: **Check/Fold**, **Check**, **Call Any**.
  - A queued pre-action fires the moment your turn arrives.
  - It applies only to the hand and street it was ticked on.
- **Bet sizing picker:**
  - Back, −, amount, + on top.
  - Chip-shaped slider with snap points and haptic ticks.
  - Presets: pre-flop raises get **2x / 3x / 4x / Pot**; everything else gets **½ Pot / ¾ Pot / Pot**; **All-In** is always there.
  - Big Confirm button.

The `ActionBar` props are unchanged, so `GamePage` needs no edits.

---

### Step 4.1: Create `src/frontend/src/lib/preActions.ts`

```ts
import { PokerAction } from '../types/game';

/** Actions a waiting player can queue so they fire the moment their turn arrives. */
export type PreActionKind = 'checkFold' | 'check' | 'callAny';

export const PRE_ACTION_KINDS: readonly PreActionKind[] = ['checkFold', 'check', 'callAny'];

export const PRE_ACTION_LABELS: Record<PreActionKind, string> = {
  checkFold: 'Check/Fold',
  check: 'Check',
  callAny: 'Call Any',
};

/**
 * The action a queued pre-action turns into once it's the player's turn, or null when it no
 * longer applies (a plain "Check" after someone bet). The server turns a short-stacked Call
 * into an all-in.
 */
export function resolvePreAction(kind: PreActionKind, canCheck: boolean): PokerAction | null {
  switch (kind) {
    case 'checkFold':
      return canCheck ? PokerAction.Check : PokerAction.Fold;
    case 'check':
      return canCheck ? PokerAction.Check : null;
    case 'callAny':
      return canCheck ? PokerAction.Check : PokerAction.Call;
  }
}
```

### Step 4.2: Create `src/frontend/src/lib/preActions.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { resolvePreAction } from './preActions';

describe('resolvePreAction', () => {
  it('Check/Fold checks when free and folds facing a bet', () => {
    expect(resolvePreAction('checkFold', true)).toBe('Check');
    expect(resolvePreAction('checkFold', false)).toBe('Fold');
  });

  it('Check only fires when checking is still possible', () => {
    expect(resolvePreAction('check', true)).toBe('Check');
    expect(resolvePreAction('check', false)).toBeNull();
  });

  it('Call Any checks when free and calls facing a bet', () => {
    expect(resolvePreAction('callAny', true)).toBe('Check');
    expect(resolvePreAction('callAny', false)).toBe('Call');
  });
});
```

### Step 4.3: Replace `src/frontend/src/components/AmountPicker.tsx`

The new props are `currentBet` and `isPreFlop`. Step 4.4 passes them.

```tsx
import { useRef, useState } from 'react';
import * as Slider from '@radix-ui/react-slider';
import { ChevronLeft } from 'lucide-react';
import { cn, formatMoney } from '@/lib/utils';
import { HAPTICS, vibrate } from '../lib/haptics';
import RetroButton from './ui/RetroButton';

interface AmountPickerProps {
  type: 'bet' | 'raise';
  min: number;
  max: number;
  pot: number;
  step: number;
  /** Bet the player is facing; pre-flop raise presets are multiples of it. */
  currentBet: number;
  isPreFlop: boolean;
  onConfirm: (amount: number) => void;
  onCancel: () => void;
}

interface Preset {
  label: string;
  value: number;
  testId: string;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export default function AmountPicker({
  type,
  min,
  max,
  pot,
  step,
  currentBet,
  isPreFlop,
  onConfirm,
  onCancel,
}: AmountPickerProps) {
  const [amount, setAmount] = useState(min);
  const testId = type === 'bet' ? 'bet-amount-input' : 'raise-amount-input';
  const label = type === 'bet' ? 'Bet' : 'Raise to';
  const confirmLabel = type === 'bet' ? 'Confirm Bet' : 'Confirm Raise';

  const presets: Preset[] = (isPreFlop && type === 'raise'
    ? [
        { label: '2x', value: currentBet * 2, testId: 'preset-2x' },
        { label: '3x', value: currentBet * 3, testId: 'preset-3x' },
        { label: '4x', value: currentBet * 4, testId: 'preset-4x' },
        { label: 'Pot', value: pot, testId: 'preset-pot' },
      ]
    : [
        { label: '½ Pot', value: Math.floor(pot / 2), testId: 'preset-half-pot' },
        { label: '¾ Pot', value: Math.floor((pot * 3) / 4), testId: 'preset-three-quarter-pot' },
        { label: 'Pot', value: pot, testId: 'preset-pot' },
      ]
  ).filter(p => p.value >= min && p.value < max);

  // Slider snap points: every visible preset plus both ends.
  const snapPoints = [...new Set([min, ...presets.map(p => p.value), max])];
  const snapThreshold = Math.max(2, Math.round((max - min) * 0.02));
  const isPointerDragging = useRef(false);

  const handleSliderChange = ([v]: number[]) => {
    const value = clamp(v, min, max);
    if (isPointerDragging.current) {
      const nearest = snapPoints.reduce((best, p) => (Math.abs(p - v) < Math.abs(best - v) ? p : best), v);
      const snapped = Math.abs(nearest - v) <= snapThreshold ? nearest : v;
      vibrate(snapped !== v ? HAPTICS.snap : HAPTICS.tick);
      setAmount(snapped);
    } else {
      setAmount(value);
    }
  };

  const chip = (selected: boolean) => cn(
    'retro-btn min-h-10 flex-1 px-1 text-sm',
    selected ? 'bg-mustard text-ink' : 'bg-card text-ink',
  );

  return (
    <div
      className="border-t-[3px] border-ink bg-paper-deep px-3 pt-2"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      data-testid="amount-picker"
    >
      <div className="mb-2 flex items-center gap-2">
        <RetroButton size="sm" onClick={onCancel} aria-label="Back to actions" className="w-11 px-0">
          <ChevronLeft aria-hidden="true" size={20} />
        </RetroButton>
        <RetroButton
          size="sm"
          onClick={() => setAmount(clamp(amount - step, min, max))}
          disabled={amount <= min}
          aria-label={`Decrease ${label} amount`}
          data-testid="amount-step-down"
          className="w-11 px-0 text-xl"
        >
          −
        </RetroButton>
        <div className="min-w-0 flex-1 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-ink-soft">{label}</div>
          <div data-testid={testId} aria-live="polite" className="font-display text-3xl leading-8 text-ink tabular-nums">
            {formatMoney(amount)}
          </div>
        </div>
        <RetroButton
          size="sm"
          onClick={() => setAmount(clamp(amount + step, min, max))}
          disabled={amount >= max}
          aria-label={`Increase ${label} amount`}
          data-testid="amount-step-up"
          className="w-11 px-0 text-xl"
        >
          +
        </RetroButton>
      </div>

      <Slider.Root
        min={min}
        max={max}
        step={1}
        value={[amount]}
        onValueChange={handleSliderChange}
        onPointerDown={() => { isPointerDragging.current = true; }}
        onPointerUp={() => { isPointerDragging.current = false; }}
        onLostPointerCapture={() => { isPointerDragging.current = false; }}
        className="relative mb-3 flex h-11 w-full touch-none select-none items-center"
        aria-label={`${label} amount`}
      >
        <Slider.Track className="relative h-3.5 grow overflow-hidden rounded-full border-[3px] border-ink bg-card">
          <Slider.Range className="absolute h-full bg-mustard" />
        </Slider.Track>
        <Slider.Thumb
          className="block h-9 w-9 rounded-full border-[3px] border-ink bg-tomato shadow-hard-sm outline-none [background-image:radial-gradient(circle,var(--color-card)_0_28%,transparent_30%)] focus-visible:ring-4 focus-visible:ring-royal"
          aria-label={`${label} amount`}
        />
      </Slider.Root>

      <div className="mb-3 flex gap-2">
        {presets.map(p => (
          <button key={p.testId} type="button" onClick={() => setAmount(clamp(p.value, min, max))} data-testid={p.testId} className={chip(amount === p.value)}>
            {p.label}
          </button>
        ))}
        <button type="button" onClick={() => setAmount(max)} data-testid="preset-all-in" className={chip(amount === max)}>
          All-In
        </button>
      </div>

      <RetroButton
        tone="mustard"
        size="lg"
        block
        onClick={() => onConfirm(amount)}
        data-testid={`confirm-${type}`}
        className="uppercase"
      >
        {confirmLabel}
      </RetroButton>
    </div>
  );
}
```

### Step 4.4: Replace `src/frontend/src/components/ActionBar.tsx`

```tsx
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
```

### Step 4.5: Create `src/frontend/src/components/ActionBar.test.tsx`

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ActionBar from './ActionBar';
import type { ActivityEntry, GameState, Player } from '../types/game';

const hero: Player = {
  playerId: 'p1',
  name: 'Alice',
  stack: 980,
  currentBet: 0,
  hasFolded: false,
  isAllIn: false,
  isDealer: false,
  isAwaitingRebuy: false,
  isEliminated: false,
};

const handStarted: ActivityEntry = {
  sequence: 1,
  entryType: 'HandStarted',
  amount: 0,
  stateVersion: 1,
  isUndone: false,
  handNumber: 1,
};

const flop = (activePlayerTurnId: string, currentBet: number): GameState => ({
  players: [hero, { ...hero, playerId: 'p2', name: 'Bob', currentBet }],
  pot: 40 + currentBet,
  currentBet,
  activePlayerTurnId,
  phase: 'Flop',
  dealerIndex: 0,
  smallBlind: 10,
  bigBlind: 20,
  minRaise: 20,
  isHandActive: true,
  pots: [],
  recentActivity: [handStarted],
});

describe('ActionBar pre-actions', () => {
  it('fires a queued Check/Fold as a fold when the hero faces a bet', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <ActionBar gameState={flop('p2', 0)} playerId="p1" onAction={onAction} isYourTurn={false} />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'Check/Fold' }));
    expect(screen.getByRole('checkbox', { name: 'Check/Fold' })).toHaveAttribute('aria-checked', 'true');

    rerender(<ActionBar gameState={flop('p1', 50)} playerId="p1" onAction={onAction} isYourTurn />);
    expect(onAction).toHaveBeenCalledWith('Fold', undefined);
  });

  it('drops a queued pre-action when the street changes before the turn arrives', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <ActionBar gameState={flop('p2', 0)} playerId="p1" onAction={onAction} isYourTurn={false} />,
    );
    await user.click(screen.getByRole('checkbox', { name: 'Call Any' }));

    rerender(<ActionBar gameState={{ ...flop('p1', 0), phase: 'Turn' }} playerId="p1" onAction={onAction} isYourTurn />);
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByText('Your Turn - Choose Action')).toBeInTheDocument();
  });
});
```

---

## Verify (from `src/frontend`)

```powershell
npx tsc -b
npm run lint
npm test
```

Expected: all exit 0, and `npm test` reports **83 passed**. That is the 78 from phase 3 plus 3 pre-action and 2 action-bar tests.
