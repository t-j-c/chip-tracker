# Phase 3: The Table (Game Page)

**Goal:** Replace the strip-and-cards game screen with an oval cartoon poker table.

- Opponents sit clockwise on the rail. Bet chips sit in front of each seat and fly to the pot.
- The board slots show how many real cards to deal, with the pot in the centre.
- Your hero panel is docked above the controls.
- Table "juice": speech bubbles, win floats, street splashes, sounds, haptics, and confetti on your own win.
- Header: room-code ticket, connection status, and a menu with Standings, Activity Log, Sound, Vibration, Reduce Motion and Host tools.
- A ticker shows the latest event.

How it fits together:

| File | Role |
|---|---|
| `lib/tableLayout.ts` | Pure geometry: seat and bet positions in % of the table stage (see 01 §8). |
| `lib/standings.ts` | Ranks players for the Standings dialog. |
| `hooks/useTableEvents.ts` | Watches `gameState.recentActivity`. New entries (sequence greater than the last seen) become bubbles, wins and splashes, plus local sound, haptics and confetti. The first snapshot is treated as history. |
| `hooks/useTurnTitle.ts` | Tab title shows "🔔 Your turn!". |
| `components/table/*` | Presentational pieces composed by `PokerTable`. |
| `pages/GamePage.tsx` | Page layout (portrait / `landscape-short` / desktop), notices, dialogs and wiring. |

---

### Step 3.1: Create `src/frontend/src/lib/tableLayout.ts`

```ts
/** A position on the table stage, in percent of its width (x) and height (y). */
export interface Point {
  x: number;
  y: number;
}

/** Seats sit on this ellipse (semi-axes in % of the stage), centred on the stage. */
export const SEAT_RX = 38;
export const SEAT_RY = 40;
/** Bet chips sit on a smaller ellipse, between each seat and the centre. */
export const BET_RX = 21;
export const BET_RY = 22;
/** Where collected bets fly to and where winnings fly from. */
export const POT_POINT: Point = { x: 50, y: 60 };
/** The hero panel sits below the stage, so winnings fly off the bottom edge. */
export const HERO_SEAT_POINT: Point = { x: 50, y: 100 };

const round = (n: number) => Math.round(n * 100) / 100;

function pointOnEllipse(angleDeg: number, rx: number, ry: number): Point {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: round(50 + rx * Math.cos(rad)), y: round(50 + ry * Math.sin(rad)) };
}

/**
 * Screen angle (degrees; 0 = right, 90 = bottom) of seat `index` out of `total` evenly spaced
 * seats. Seat 0 is the hero at the bottom; indexes increase clockwise as seen on screen.
 */
export function seatAngle(index: number, total: number): number {
  return 90 + (index * 360) / total;
}

export interface SeatSpot {
  seat: Point;
  bet: Point;
}

/**
 * Seat and bet-chip positions for `opponentCount` opponents listed clockwise starting with the
 * player to the hero's left (the order returned by `opponentsInSeatOrder`).
 */
export function opponentLayout(opponentCount: number): SeatSpot[] {
  const total = opponentCount + 1;
  return Array.from({ length: opponentCount }, (_, i) => {
    const angle = seatAngle(i + 1, total);
    return { seat: pointOnEllipse(angle, SEAT_RX, SEAT_RY), bet: pointOnEllipse(angle, BET_RX, BET_RY) };
  });
}

/** The hero's bet chip, just above the hero panel. */
export const HERO_BET_POINT: Point = pointOnEllipse(90, BET_RX, BET_RY);
```

### Step 3.2: Create `src/frontend/src/lib/tableLayout.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { opponentLayout, seatAngle, HERO_BET_POINT } from './tableLayout';

describe('tableLayout', () => {
  it('puts the hero at the bottom and spaces seats clockwise', () => {
    expect(seatAngle(0, 4)).toBe(90);
    expect(seatAngle(1, 4)).toBe(180);
    expect(seatAngle(2, 4)).toBe(270);
  });

  it('seats a heads-up opponent at the top centre', () => {
    const [spot] = opponentLayout(1);
    expect(spot.seat).toEqual({ x: 50, y: 10 });
    expect(spot.bet).toEqual({ x: 50, y: 28 });
  });

  it('goes left, top, right for three opponents (clockwise from the hero)', () => {
    const seats = opponentLayout(3).map(s => s.seat);
    expect(seats).toEqual([
      { x: 12, y: 50 },
      { x: 50, y: 10 },
      { x: 88, y: 50 },
    ]);
  });

  it('returns one spot per opponent with bets closer to the centre than seats', () => {
    const spots = opponentLayout(8);
    expect(spots).toHaveLength(8);
    for (const { seat, bet } of spots) {
      expect(Math.hypot(bet.x - 50, bet.y - 50)).toBeLessThan(Math.hypot(seat.x - 50, seat.y - 50));
    }
  });

  it('places the hero bet chip below the centre', () => {
    expect(HERO_BET_POINT).toEqual({ x: 50, y: 72 });
  });
});
```

### Step 3.3: Create `src/frontend/src/lib/standings.ts`

```ts
import type { Player } from '../types/game';

export interface Standing {
  playerId: string;
  name: string;
  stack: number;
  /** Position in the table's player list, used for the avatar colour. */
  seatIndex: number;
  /** Competition ranking: tied stacks share a rank (1, 1, 3). */
  rank: number;
  /** Fraction of all chips currently in stacks (0–1). */
  share: number;
  isEliminated: boolean;
}

/** Players ranked by current stack, biggest first; ties are ordered by name. */
export function computeStandings(players: readonly Player[]): Standing[] {
  const total = players.reduce((sum, p) => sum + p.stack, 0);
  const sorted = players
    .map((player, seatIndex) => ({ player, seatIndex }))
    .sort((a, b) => b.player.stack - a.player.stack || a.player.name.localeCompare(b.player.name));

  let rank = 0;
  let lastStack: number | null = null;
  return sorted.map(({ player, seatIndex }, i) => {
    if (player.stack !== lastStack) {
      rank = i + 1;
      lastStack = player.stack;
    }
    return {
      playerId: player.playerId,
      name: player.name,
      stack: player.stack,
      seatIndex,
      rank,
      share: total > 0 ? player.stack / total : 0,
      isEliminated: player.isEliminated,
    };
  });
}
```

### Step 3.4: Create `src/frontend/src/lib/standings.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { computeStandings } from './standings';
import type { Player } from '../types/game';

const player = (playerId: string, name: string, stack: number): Player => ({
  playerId,
  name,
  stack,
  currentBet: 0,
  hasFolded: false,
  isAllIn: false,
  isDealer: false,
  isAwaitingRebuy: false,
  isEliminated: false,
});

describe('computeStandings', () => {
  it('ranks by stack with shared ranks for ties and keeps the seat index', () => {
    const standings = computeStandings([
      player('a', 'Alice', 500),
      player('b', 'Bob', 1500),
      player('c', 'Cara', 500),
      player('d', 'Dan', 0),
    ]);

    expect(standings.map(s => [s.name, s.rank, s.seatIndex])).toEqual([
      ['Bob', 1, 1],
      ['Alice', 2, 0],
      ['Cara', 2, 2],
      ['Dan', 4, 3],
    ]);
    expect(standings[0].share).toBeCloseTo(0.6);
  });

  it('reports zero share when no chips are in stacks', () => {
    expect(computeStandings([player('a', 'Alice', 0)])[0].share).toBe(0);
  });
});
```

### Step 3.5: Create `src/frontend/src/hooks/useTableEvents.ts`

```ts
import { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import type { GameState, PokerAction } from '../types/game';
import { playSound, type SoundName } from '../lib/sound';
import { HAPTICS, vibrate } from '../lib/haptics';
import { prefersReducedMotion } from '../lib/motion';

export interface ActionBubbleInfo {
  key: number;
  action: PokerAction;
}

export interface WinInfo {
  key: number;
  amount: number;
}

export interface PhaseSplashInfo {
  key: number;
  title: string;
  subtitle: string;
}

export const BUBBLE_MS = 1600;
export const WIN_MS = 2200;
export const SPLASH_MS = 1400;

const SPLASHES: Record<string, { title: string; subtitle: string }> = {
  Flop: { title: 'Flop!', subtitle: 'Deal 3 cards' },
  Turn: { title: 'Turn!', subtitle: 'Deal 1 card' },
  River: { title: 'River!', subtitle: 'Deal 1 card' },
  Showdown: { title: 'Showdown!', subtitle: 'Show your cards' },
};

const ACTION_SOUNDS: Record<PokerAction, SoundName> = {
  Fold: 'fold',
  Check: 'check',
  Call: 'chip',
  Bet: 'chip',
  Raise: 'chip',
  AllIn: 'chip',
};

const CONFETTI_COLORS = ['#EF5B3F', '#F2B632', '#3BB8AE', '#F28DB2', '#2F5DA8', '#F7EBCF'];

function without<T>(map: Record<string, T>, key: string): Record<string, T> {
  const next = { ...map };
  delete next[key];
  return next;
}

/**
 * Turns new activity-log entries into table "juice": speech bubbles for actions, win floats,
 * street splashes, plus sound/haptics/confetti on this device. Entries already present in the
 * first snapshot are history, not news, and are ignored.
 */
export function useTableEvents(
  gameState: GameState | null,
  playerId: string | null,
  announce: (message: string) => void,
) {
  const [bubbles, setBubbles] = useState<Record<string, ActionBubbleInfo>>({});
  const [wins, setWins] = useState<Record<string, WinInfo>>({});
  const [splash, setSplash] = useState<PhaseSplashInfo | null>(null);
  const lastSeqRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);
  const prevTurnRef = useRef<string | null | undefined>(undefined);
  const entries = gameState?.recentActivity;
  const activeTurnId = gameState?.activePlayerTurnId ?? null;

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  useEffect(() => {
    if (!entries || entries.length === 0) return;
    const maxSeq = Math.max(...entries.map(e => e.sequence));
    const lastSeen = lastSeqRef.current;
    lastSeqRef.current = Math.max(lastSeen ?? maxSeq, maxSeq);
    if (lastSeen === null) return;

    const fresh = entries
      .filter(e => e.sequence > lastSeen && !e.isUndone)
      .sort((a, b) => a.sequence - b.sequence);
    const later = (ms: number, fn: () => void) => {
      timersRef.current.push(window.setTimeout(fn, ms));
    };

    for (const entry of fresh) {
      const key = entry.sequence;
      switch (entry.entryType) {
        case 'PlayerAction': {
          const pid = entry.playerId;
          const action = entry.action;
          if (!pid || !action) break;
          setBubbles(b => ({ ...b, [pid]: { key, action } }));
          later(BUBBLE_MS, () => setBubbles(b => (b[pid]?.key === key ? without(b, pid) : b)));
          if (pid === playerId) {
            playSound(ACTION_SOUNDS[action]);
            vibrate(HAPTICS.action);
          }
          break;
        }
        case 'PotWon': {
          const pid = entry.playerId;
          if (!pid) break;
          setWins(w => ({ ...w, [pid]: { key, amount: entry.amount } }));
          later(WIN_MS, () => setWins(w => (w[pid]?.key === key ? without(w, pid) : w)));
          announce(`${entry.playerName ?? 'A player'} won the pot`);
          if (pid === playerId) {
            playSound('win');
            vibrate(HAPTICS.win);
            if (!prefersReducedMotion()) {
              void confetti({
                particleCount: 90,
                spread: 75,
                origin: { y: 0.75 },
                colors: CONFETTI_COLORS,
                disableForReducedMotion: true,
              });
            }
          }
          break;
        }
        case 'PhaseAdvanced': {
          const info = SPLASHES[entry.newPhase ?? entry.phase ?? ''];
          if (!info) break;
          setSplash({ key, ...info });
          later(SPLASH_MS, () => setSplash(s => (s?.key === key ? null : s)));
          playSound('deal');
          break;
        }
        case 'HandStarted': {
          setSplash({ key, title: `Hand #${entry.handNumber}`, subtitle: 'Deal 2 cards each' });
          later(SPLASH_MS, () => setSplash(s => (s?.key === key ? null : s)));
          break;
        }
        default:
          break;
      }
    }
  }, [entries, playerId, announce]);

  useEffect(() => {
    const prev = prevTurnRef.current;
    prevTurnRef.current = activeTurnId;
    if (prev === undefined) return;
    if (activeTurnId && activeTurnId === playerId && prev !== activeTurnId) {
      playSound('turn');
      vibrate(HAPTICS.turn);
    }
  }, [activeTurnId, playerId]);

  return { bubbles, wins, splash };
}
```

### Step 3.6: Create `src/frontend/src/hooks/useTableEvents.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ActivityEntry, GameState } from '../types/game';

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
vi.mock('../lib/sound', () => ({ playSound: vi.fn() }));
vi.mock('../lib/haptics', () => ({ vibrate: vi.fn(), HAPTICS: { action: 15, turn: [1], win: [1] } }));

import confetti from 'canvas-confetti';
import { playSound } from '../lib/sound';
import { useTableEvents, BUBBLE_MS } from './useTableEvents';

const entry = (sequence: number, extra: Partial<ActivityEntry>): ActivityEntry => ({
  sequence,
  entryType: 'PlayerAction',
  amount: 0,
  stateVersion: sequence,
  isUndone: false,
  handNumber: 1,
  ...extra,
});

const state = (recentActivity: ActivityEntry[], activePlayerTurnId: string | null = null): GameState => ({
  players: [],
  pot: 0,
  currentBet: 0,
  activePlayerTurnId,
  phase: 'PreFlop',
  dealerIndex: 0,
  smallBlind: 10,
  bigBlind: 20,
  minRaise: 20,
  isHandActive: true,
  pots: [],
  recentActivity,
});

describe('useTableEvents', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it('treats the first snapshot as history and shows bubbles only for new actions', () => {
    const announce = vi.fn();
    const first = state([entry(1, { playerId: 'p2', action: 'Bet' })]);
    const { result, rerender } = renderHook(({ gs }) => useTableEvents(gs, 'p1', announce), {
      initialProps: { gs: first },
    });
    expect(result.current.bubbles).toEqual({});

    rerender({ gs: state([...first.recentActivity!, entry(2, { playerId: 'p2', action: 'Raise' })]) });
    expect(result.current.bubbles.p2).toEqual({ key: 2, action: 'Raise' });

    act(() => vi.advanceTimersByTime(BUBBLE_MS));
    expect(result.current.bubbles).toEqual({});
  });

  it('celebrates on this device only when the hero wins a pot', () => {
    const announce = vi.fn();
    const first = state([entry(1, { entryType: 'HandStarted' })]);
    const { result, rerender } = renderHook(({ gs }) => useTableEvents(gs, 'p1', announce), {
      initialProps: { gs: first },
    });

    rerender({ gs: state([...first.recentActivity!, entry(2, { entryType: 'PotWon', playerId: 'p2', playerName: 'Bob', amount: 40 })]) });
    expect(result.current.wins.p2).toEqual({ key: 2, amount: 40 });
    expect(announce).toHaveBeenCalledWith('Bob won the pot');
    expect(confetti).not.toHaveBeenCalled();

    rerender({ gs: state([entry(3, { entryType: 'PotWon', playerId: 'p1', playerName: 'Alice', amount: 60 })]) });
    expect(confetti).toHaveBeenCalledTimes(1);
    expect(playSound).toHaveBeenCalledWith('win');
  });

  it('plays the turn sound when the turn moves to the hero', () => {
    const { rerender } = renderHook(({ gs }) => useTableEvents(gs, 'p1', vi.fn()), {
      initialProps: { gs: state([], 'p2') },
    });
    expect(playSound).not.toHaveBeenCalled();

    rerender({ gs: state([], 'p1') });
    expect(playSound).toHaveBeenCalledWith('turn');
  });
});
```

### Step 3.7: Create `src/frontend/src/hooks/useTurnTitle.ts`

```ts
import { useEffect } from 'react';

const BASE_TITLE = 'Deal Me In';

/** Shows "Your turn!" in the browser tab title so a backgrounded tab still signals the turn. */
export function useTurnTitle(isYourTurn: boolean) {
  useEffect(() => {
    document.title = isYourTurn ? `🔔 Your turn! · ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [isYourTurn]);
}
```

### Step 3.8: Create `src/frontend/src/components/table/ActionBubble.tsx`

```tsx
import type { PokerAction } from '../../types/game';
import { cn } from '@/lib/utils';

// No amounts and no "All In" (with a space) in bubble text: see the e2e test contract.
const BUBBLES: Record<PokerAction, { text: string; className: string }> = {
  Fold: { text: 'Fold!', className: 'bg-tomato text-ink' },
  Check: { text: 'Check!', className: 'bg-teal text-ink' },
  Call: { text: 'Call!', className: 'bg-royal text-paper' },
  Bet: { text: 'Bet!', className: 'bg-mustard text-ink' },
  Raise: { text: 'Raise!', className: 'bg-mustard text-ink' },
  AllIn: { text: 'All-in!', className: 'bg-grape text-paper' },
};

interface ActionBubbleProps {
  action: PokerAction;
  /** Above the avatar, or below it for seats near the top edge of the table. */
  placement: 'above' | 'below';
}

/** Comic speech bubble shouting a player's latest action. Decorative: the live region announces turns. */
export default function ActionBubble({ action, placement }: ActionBubbleProps) {
  const { text, className } = BUBBLES[action];
  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute left-1/2 z-40 -translate-x-1/2',
        placement === 'above' ? 'bottom-full mb-1' : 'top-full mt-1',
      )}
    >
      <div
        className={cn(
          'keep-visible-reduced animate-bubble relative whitespace-nowrap rounded-xl border-[3px] border-ink px-2.5 py-0.5 font-comic text-xl leading-tight tracking-wider shadow-hard-sm',
          className,
        )}
      >
        {text}
        <span
          className={cn(
            'absolute left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-ink',
            placement === 'above' ? '-bottom-[7px] border-b-[3px] border-r-[3px]' : '-top-[7px] border-l-[3px] border-t-[3px]',
            className,
          )}
        />
      </div>
    </div>
  );
}
```

### Step 3.9: Create `src/frontend/src/components/table/WinFloat.tsx`

```tsx
import { formatMoney } from '@/lib/utils';

/**
 * "+$120" floating up from a winner. The amount is CSS pseudo-content (data-amount + .win-float)
 * so it can never collide with e2e getByText('$30')-style pot assertions.
 */
export default function WinFloat({ amount }: { amount: number }) {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute -top-7 left-1/2 z-40 -translate-x-1/2">
      <span
        data-amount={`+${formatMoney(amount)}`}
        className="win-float keep-visible-reduced animate-float-up text-outline block whitespace-nowrap font-comic text-3xl tracking-wider text-mustard"
      />
    </span>
  );
}
```

### Step 3.10: Create `src/frontend/src/components/table/PhaseSplash.tsx`

```tsx
interface PhaseSplashProps {
  title: string;
  subtitle: string;
}

/** Comic title card over the felt when a street is dealt ("Flop!" / "Deal 3 cards"). */
export default function PhaseSplash({ title, subtitle }: PhaseSplashProps) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-[38%] z-30 -translate-x-1/2 -translate-y-1/2"
    >
      <div className="keep-visible-reduced animate-splash flex flex-col items-center">
        <span className="text-outline whitespace-nowrap font-comic text-5xl tracking-wider text-mustard drop-shadow-[4px_4px_0_#1B1718]">
          {title}
        </span>
        <span className="-mt-1 whitespace-nowrap rounded-full border-2 border-ink bg-card px-2.5 py-px font-display text-xs uppercase tracking-wide text-ink shadow-hard-sm">
          {subtitle}
        </span>
      </div>
    </div>
  );
}
```

### Step 3.11: Create `src/frontend/src/components/table/ChipFlight.tsx`

```tsx
import type { CSSProperties } from 'react';
import type { Point } from '../../lib/tableLayout';
import ChipStack from '../ui/ChipStack';

interface ChipFlightProps {
  from: Point;
  to: Point;
  count: number;
  onDone: () => void;
}

/** A chip stack that flies across the stage once (bets to the pot, pot to a winner), then calls onDone. */
export default function ChipFlight({ from, to, count, onDone }: ChipFlightProps) {
  const style = {
    '--from-x': `${from.x}%`,
    '--from-y': `${from.y}%`,
    '--to-x': `${to.x}%`,
    '--to-y': `${to.y}%`,
    left: `${from.x}%`,
    top: `${from.y}%`,
  } as CSSProperties;

  return (
    <div
      aria-hidden="true"
      className="animate-chip-flight pointer-events-none absolute z-30"
      style={style}
      onAnimationEnd={onDone}
    >
      <ChipStack count={count} size={24} />
    </div>
  );
}
```

### Step 3.12: Create `src/frontend/src/components/table/BetChip.tsx`

```tsx
import { useEffect, useRef, useState } from 'react';
import { POT_POINT, type Point } from '../../lib/tableLayout';
import { chipCountForAmount } from '../../lib/chips';
import { formatMoney } from '@/lib/utils';
import ChipStack from '../ui/ChipStack';
import ChipFlight from './ChipFlight';

interface BetChipProps {
  amount: number;
  at: Point;
  bigBlind: number;
}

/** A player's current-street bet on the felt. When it clears (street over), the chips fly to the pot. */
export default function BetChip({ amount, at, bigBlind }: BetChipProps) {
  const [flights, setFlights] = useState<{ key: number; amount: number }[]>([]);
  const prevAmount = useRef(amount);

  useEffect(() => {
    const before = prevAmount.current;
    prevAmount.current = amount;
    if (before > 0 && amount === 0) {
      setFlights(list => [...list, { key: Date.now(), amount: before }]);
    }
  }, [amount]);

  return (
    <>
      {amount > 0 && (
        <div
          className="table-piece pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${at.x}%`, top: `${at.y}%` }}
        >
          <div key={amount} className="animate-pop-in flex flex-col items-center">
            <ChipStack count={chipCountForAmount(amount, bigBlind)} size={18} />
            <span className="-mt-0.5 rounded-full border-2 border-ink bg-card px-1.5 font-display text-xs leading-4 text-ink shadow-hard-sm tabular-nums">
              {formatMoney(amount)}
            </span>
          </div>
        </div>
      )}
      {flights.map(f => (
        <ChipFlight
          key={f.key}
          from={at}
          to={POT_POINT}
          count={chipCountForAmount(f.amount, bigBlind)}
          onDone={() => setFlights(list => list.filter(x => x.key !== f.key))}
        />
      ))}
    </>
  );
}
```

### Step 3.13: Create `src/frontend/src/components/table/CenterPot.tsx`

```tsx
import type { GameState } from '../../types/game';
import { useAnimatedNumber } from '../../hooks/useAnimatedNumber';
import { chipCountForAmount } from '../../lib/chips';
import { formatMoney } from '@/lib/utils';
import ChipStack from '../ui/ChipStack';

/**
 * Pot total in the middle of the felt, with side-pot breakdown when there is more than one pot.
 * Kept narrow so bet chips of side seats never touch it.
 */
export default function CenterPot({ state }: { state: GameState }) {
  const animatedPot = useAnimatedNumber(state.pot);
  const pots = state.pots ?? [];
  const hasSidePots = pots.length > 1;

  return (
    <div className="flex flex-col items-center">
      <div className="relative flex flex-col items-center rounded-2xl border-[3px] border-ink bg-card px-3 pb-0.5 pt-1 shadow-hard">
        <ChipStack
          count={Math.max(1, chipCountForAmount(state.pot, state.bigBlind))}
          size={22}
          colorOffset={2}
          className="absolute -left-4 -top-3"
        />
        <span className="text-[10px] font-semibold uppercase leading-3 tracking-[0.2em] text-ink-soft">Pot</span>
        {/* Text must be exactly the formatted pot: e2e uses toHaveText('$40') and getByText('$30'). */}
        <span data-testid="pot-amount" className="font-display text-2xl leading-7 text-ink tabular-nums">
          {formatMoney(animatedPot)}
        </span>
      </div>
      {hasSidePots && (
        <div data-testid="pot-breakdown" className="mt-1 flex max-w-[200px] flex-wrap justify-center gap-1">
          {pots.map((p, i) => (
            <span
              key={i}
              className="rounded-full border-2 border-ink bg-mustard px-1.5 text-[11px] font-semibold leading-4 text-ink"
            >
              {i === 0 ? 'Main Pot' : `Side Pot ${i}`}: {formatMoney(p.amount)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Step 3.14: Create `src/frontend/src/components/table/BoardCards.tsx`

```tsx
const DEALT: Record<string, number> = { PreFlop: 0, Flop: 3, Turn: 4, River: 5, Showdown: 5 };
const LABELS: Record<string, string> = {
  PreFlop: 'Pre-Flop',
  Flop: 'Flop',
  Turn: 'Turn',
  River: 'River',
  Showdown: 'Showdown',
};

/**
 * Five community-card slots showing how many cards should be on the real table for this street,
 * plus the street name. Keeps the hidden phase-indicator the e2e suite reads.
 */
export default function BoardCards({ phase }: { phase: string }) {
  const dealt = DEALT[phase] ?? 0;
  return (
    <div className="flex flex-col items-center gap-1">
      <div aria-hidden="true" className="flex gap-[3px]">
        {[0, 1, 2, 3, 4].map(i =>
          i < dealt ? (
            <span
              key={`card-${i}`}
              className="card-back animate-deal-in h-8 w-[22px] rounded-[5px] border-2 border-ink shadow-hard-sm"
              style={{ animationDelay: `${i < 3 ? i * 60 : 0}ms` }}
            />
          ) : (
            <span key={`slot-${i}`} className="h-8 w-[22px] rounded-[5px] border-2 border-dashed border-paper/45" />
          ),
        )}
      </div>
      <span className="rounded-full border-2 border-ink bg-ink px-2.5 py-px font-display text-[11px] uppercase leading-4 tracking-widest text-paper">
        {LABELS[phase] ?? phase}
      </span>
      {/* E2E: waitForPhase() reads this exact text. */}
      <span className="sr-only" data-testid="phase-indicator" aria-live="polite">
        {phase}
      </span>
    </div>
  );
}
```

### Step 3.15: Create `src/frontend/src/components/table/Seat.tsx`

```tsx
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

interface SeatProps {
  player: Player;
  at: Point;
  colorIndex: number;
  /** "lg" up to 4 opponents, "md" for 5+ so a full 9-max table fits a phone. */
  avatarSize: 'md' | 'lg';
  isActive: boolean;
  bubble?: ActionBubbleInfo;
  win?: WinInfo;
}

/** An opponent sitting on the rail: avatar, name plate, stack and status. */
export default function Seat({ player, at, colorIndex, avatarSize, isActive, bubble, win }: SeatProps) {
  const [isFolding, setIsFolding] = useState(false);
  const prevFolded = useRef(player.hasFolded);
  useEffect(() => {
    if (!prevFolded.current && player.hasFolded) setIsFolding(true);
    prevFolded.current = player.hasFolded;
  }, [player.hasFolded]);

  const isOut = player.hasFolded || player.isEliminated;

  return (
    <div
      data-testid={`opponent-panel-${player.playerId}`}
      className="table-piece absolute z-20 flex w-[78px] -translate-x-1/2 -translate-y-1/2 flex-col items-center"
      style={{ left: `${at.x}%`, top: `${at.y}%` }}
    >
      <div
        className={cn('relative', isFolding && 'animate-fold-flip', isOut && 'opacity-50 grayscale')}
        onAnimationEnd={() => setIsFolding(false)}
      >
        <div
          className={cn(
            'rounded-full transition-transform duration-200',
            isActive && 'turn-ring animate-turn-pulse scale-105',
            win && 'winner-ring animate-winner-glow',
          )}
        >
          <Avatar name={player.name} colorIndex={colorIndex} size={avatarSize} />
        </div>
        {player.isDealer && <DealerChip variant="puck" className="absolute -left-2 -top-1" />}
        {isActive && (
          <span
            aria-hidden="true"
            className="animate-bob absolute -right-3 -top-2 rounded-full border-2 border-ink bg-card px-1 font-display text-xs leading-4 text-ink"
          >
            …
          </span>
        )}
        {player.hasFolded && !player.isEliminated && (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 rounded border-2 border-tomato-deep bg-card/90 px-1 font-display text-[11px] uppercase leading-4 tracking-wider text-tomato-deep">
            Folded
          </span>
        )}
      </div>
      <div className="relative z-10 -mt-2 max-w-full rounded-full border-[3px] border-ink bg-card px-2 py-px shadow-hard-sm">
        <div className="truncate text-center font-display text-[13px] leading-4 text-ink">{player.name}</div>
      </div>
      <div className="mt-0.5 rounded-md bg-ink/85 px-1.5 font-display text-xs leading-5 text-paper tabular-nums">
        {formatMoney(player.stack)}
      </div>
      <div className="mt-0.5">
        <StatusTag player={player} />
      </div>
      {isActive && <span className="sr-only">(to act)</span>}
      {bubble && <ActionBubble key={bubble.key} action={bubble.action} placement={at.y < 30 ? 'below' : 'above'} />}
      {win && <WinFloat key={win.key} amount={win.amount} />}
    </div>
  );
}
```

### Step 3.16: Create `src/frontend/src/components/table/HeroPanel.tsx`

```tsx
import type { Player } from '../../types/game';
import type { ActionBubbleInfo, WinInfo } from '../../hooks/useTableEvents';
import { useAnimatedNumber } from '../../hooks/useAnimatedNumber';
import { cn, formatMoney } from '@/lib/utils';
import Avatar from '../ui/Avatar';
import DealerChip from '../ui/DealerChip';
import StatusTag from '../ui/StatusTag';
import ActionBubble from './ActionBubble';
import WinFloat from './WinFloat';

interface HeroPanelProps {
  player: Player;
  colorIndex: number;
  isActive: boolean;
  bubble?: ActionBubbleInfo;
  win?: WinInfo;
}

/**
 * "Your seat": the biggest, most glanceable stack on screen, docked above the action bar.
 * E2E reads "Stack:" (exact), "Your bet: $N", "Dealer" and the formatted stack from here.
 */
export default function HeroPanel({ player, colorIndex, isActive, bubble, win }: HeroPanelProps) {
  const animatedStack = useAnimatedNumber(player.stack);
  const isOut = player.hasFolded || player.isEliminated;

  return (
    <div
      data-testid="self-player-panel"
      className={cn(
        'retro-panel relative mx-3 mb-2 flex items-center gap-3 px-3 py-2 transition-colors duration-300',
        isActive && 'bg-[#FFF1C7]',
      )}
    >
      <div
        className={cn(
          'shrink-0 rounded-full',
          isActive && 'turn-ring animate-turn-pulse',
          win && 'winner-ring animate-winner-glow',
          isOut && 'opacity-50 grayscale',
        )}
      >
        <Avatar name={player.name} colorIndex={colorIndex} size="xl" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-display text-lg leading-tight text-ink">{player.name}</span>
          <span className="shrink-0 rounded-full border-2 border-ink bg-bubblegum px-1.5 font-display text-[10px] uppercase leading-4 tracking-wider text-ink">
            You
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {player.isDealer && <DealerChip variant="pill" />}
          <StatusTag player={player} showFolded />
        </div>
        {player.currentBet > 0 && (
          <div className="mt-0.5 text-sm font-medium text-ink-soft">
            Your bet: <span className="font-display text-ink tabular-nums">{formatMoney(player.currentBet)}</span>
          </div>
        )}
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
```

### Step 3.17: Create `src/frontend/src/components/table/PokerTable.tsx`

```tsx
import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../../types/game';
import type { ActionBubbleInfo, PhaseSplashInfo, WinInfo } from '../../hooks/useTableEvents';
import { opponentsInSeatOrder } from '../../lib/seating';
import { chipCountForAmount } from '../../lib/chips';
import { HERO_BET_POINT, HERO_SEAT_POINT, POT_POINT, opponentLayout, type Point } from '../../lib/tableLayout';
import BoardCards from './BoardCards';
import CenterPot from './CenterPot';
import BetChip from './BetChip';
import ChipFlight from './ChipFlight';
import Seat from './Seat';
import PhaseSplash from './PhaseSplash';

interface PokerTableProps {
  gameState: GameState;
  playerId: string | null;
  bubbles: Record<string, ActionBubbleInfo>;
  wins: Record<string, WinInfo>;
  splash: PhaseSplashInfo | null;
}

/**
 * The oval felt with opponents seated clockwise from the hero's left, bets in front of each seat,
 * and the board + pot in the middle. The hero's own seat is the HeroPanel below this stage.
 */
export default function PokerTable({ gameState, playerId, bubbles, wins, splash }: PokerTableProps) {
  const opponents = opponentsInSeatOrder(gameState.players, playerId);
  const layout = opponentLayout(opponents.length);
  const hero = gameState.players.find(p => p.playerId === playerId) ?? null;
  const seatIndexOf = (id: string) => gameState.players.findIndex(p => p.playerId === id);

  const seatPoint = (id: string): Point => {
    if (id === playerId) return HERO_SEAT_POINT;
    const i = opponents.findIndex(p => p.playerId === id);
    return i >= 0 ? layout[i].seat : POT_POINT;
  };

  // Pot-to-winner chip flights, one per new win.
  const [payouts, setPayouts] = useState<{ key: number; to: Point; count: number }[]>([]);
  const seenWins = useRef(new Set<number>());
  useEffect(() => {
    const fresh = Object.entries(wins).filter(([, w]) => !seenWins.current.has(w.key));
    if (fresh.length === 0) return;
    fresh.forEach(([, w]) => seenWins.current.add(w.key));
    setPayouts(list => [
      ...list,
      ...fresh.map(([id, w]) => ({
        key: w.key,
        to: seatPoint(id),
        count: chipCountForAmount(w.amount, gameState.bigBlind),
      })),
    ]);
    // seatPoint is derived from props that are captured at the moment the win arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wins]);

  return (
    <div className="table-stage relative mx-auto h-full w-full max-w-[880px]" data-testid="poker-table">
      <div aria-hidden="true" className="felt table-rail absolute inset-x-[9%] inset-y-[7%] rounded-[50%]" />

      <div className="table-piece absolute left-1/2 top-[53%] z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5">
        <BoardCards phase={gameState.phase} />
        <CenterPot state={gameState} />
      </div>

      {opponents.map((p, i) => (
        <BetChip key={`bet-${p.playerId}`} amount={p.currentBet} at={layout[i].bet} bigBlind={gameState.bigBlind} />
      ))}
      {hero && <BetChip amount={hero.currentBet} at={HERO_BET_POINT} bigBlind={gameState.bigBlind} />}

      {/* DOM order = clockwise seat order (e2e TC62/TC63 read opponents by index). */}
      {opponents.map((p, i) => (
        <Seat
          key={p.playerId}
          player={p}
          at={layout[i].seat}
          colorIndex={seatIndexOf(p.playerId)}
          avatarSize={opponents.length > 4 ? 'md' : 'lg'}
          isActive={gameState.activePlayerTurnId === p.playerId}
          bubble={bubbles[p.playerId]}
          win={wins[p.playerId]}
        />
      ))}

      {payouts.map(p => (
        <ChipFlight
          key={`payout-${p.key}`}
          from={POT_POINT}
          to={p.to}
          count={p.count}
          onDone={() => setPayouts(list => list.filter(x => x.key !== p.key))}
        />
      ))}

      {splash && <PhaseSplash key={splash.key} title={splash.title} subtitle={splash.subtitle} />}
    </div>
  );
}
```

### Step 3.18: Create `src/frontend/src/components/StandingsDialog.tsx`

```tsx
import { Trophy } from 'lucide-react';
import type { Player } from '../types/game';
import { computeStandings } from '../lib/standings';
import { cn, formatMoney } from '@/lib/utils';
import { DialogShell } from './DialogShell';
import Avatar from './ui/Avatar';

interface StandingsDialogProps {
  players: Player[];
  onClose: () => void;
}

const RANK_BADGE: Record<number, string> = { 1: 'bg-mustard', 2: 'bg-card', 3: 'bg-[#E8A87C]' };

/** Leaderboard of current stacks, opened from the header menu. */
export default function StandingsDialog({ players, onClose }: StandingsDialogProps) {
  const standings = computeStandings(players);
  const topStack = standings[0]?.stack ?? 0;
  const tableTotal = standings.reduce((sum, s) => sum + s.stack, 0);

  return (
    <DialogShell
      title="Standings"
      testId="standings-dialog"
      onOpenChange={(open) => !open && onClose()}
      ariaDescribedBy="standings-description"
    >
      <p id="standings-description" className="mb-3 text-sm text-ink-soft">
        Chip counts right now. Chips in the pot count once the hand ends.
      </p>
      <ol className="space-y-2">
        {standings.map(s => (
          <li
            key={s.playerId}
            data-testid={`standing-${s.playerId}`}
            className={cn(
              'flex items-center gap-2.5 rounded-xl border-[3px] border-ink bg-paper py-1.5 pl-1.5 pr-3 shadow-hard-sm',
              s.isEliminated && 'opacity-50',
            )}
          >
            <span
              className={cn(
                'grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-ink font-display text-sm text-ink',
                RANK_BADGE[s.rank] ?? 'bg-paper-deep',
              )}
            >
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
      <p className="mt-4 text-center text-xs font-semibold uppercase tracking-wider text-ink-soft tabular-nums">
        Chips in stacks: {formatMoney(tableTotal)}
      </p>
    </DialogShell>
  );
}
```

### Step 3.19: Replace `src/frontend/src/components/GameHeader.tsx`

This adds two **required** props, `onOpenStandings` and `onOpenActivity`. The only caller is `GamePage`, which is replaced in Step 3.21.

```tsx
import { useState, useRef, useEffect } from 'react';
import { MoreVertical, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '../stores/settingsStore';
import { ChipLogoMark } from './ChipLogo';

interface GameHeaderProps {
  roomCode: string;
  isConnected: boolean;
  undoPending: boolean;
  onRequestUndo: () => void;
  onOpenStandings: () => void;
  onOpenActivity: () => void;
  /** Room creator only: opens the seating-order editor. Admin items are hidden when omitted. */
  onOpenSeatOrder?: () => void;
  /** Room creator only: opens the restart-hand confirmation. */
  onRestartHand?: () => void;
}

const MENU_ITEM = 'flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-ink transition-colors hover:bg-mustard/40 disabled:cursor-not-allowed disabled:text-ink-soft disabled:hover:bg-transparent';

export default function GameHeader({
  roomCode,
  isConnected,
  undoPending,
  onRequestUndo,
  onOpenStandings,
  onOpenActivity,
  onOpenSeatOrder,
  onRestartHand,
}: GameHeaderProps) {
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { soundOn, hapticsOn, reduceMotion, toggle } = useSettingsStore();

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const runAndClose = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  // Close on outside click or Escape. No backdrop: the menu button must stay clickable to toggle.
  useEffect(() => {
    if (!menuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header
      className="flex shrink-0 items-center justify-between gap-2 bg-ink px-3 pb-2 text-paper"
      style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top))' }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <ChipLogoMark size={30} />
        <span className="hidden font-display text-lg leading-none tracking-wide min-[400px]:inline">Deal Me In</span>
      </div>

      <button
        onClick={handleCopyCode}
        className="flex items-center gap-1.5 rounded-lg border-2 border-paper bg-mustard px-2.5 py-1 font-display text-sm tracking-[0.2em] text-ink shadow-[2px_2px_0_0_#F7EBCF] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline-mustard"
        aria-label={`Room code ${roomCode}, tap to copy`}
        data-testid="room-code-header"
      >
        {roomCode}
        {copied ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}
      </button>

      <div className="flex items-center gap-2">
        <span
          role="status"
          aria-label={isConnected ? 'Connected' : 'Reconnecting'}
          className={cn(
            'inline-flex h-4 items-center gap-1 rounded-full border-2 border-paper',
            isConnected ? 'w-4 bg-teal' : 'animate-pulse bg-mustard px-1.5 font-display text-[10px] uppercase leading-none text-ink',
          )}
        >
          {!isConnected && 'Reconnecting…'}
        </span>

        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="rounded-lg p-1.5 text-paper transition-colors hover:bg-paper/15 focus-visible:outline-mustard"
            aria-label="Menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            data-testid="overflow-menu-btn"
          >
            <MoreVertical aria-hidden="true" size={22} />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="animate-pop-in absolute right-0 top-full z-50 mt-2 w-56 origin-top-right overflow-hidden rounded-2xl border-[3px] border-ink bg-card py-1 text-ink shadow-hard-lg"
            >
              <button
                role="menuitem"
                onClick={runAndClose(onRequestUndo)}
                disabled={undoPending}
                className={MENU_ITEM}
                data-testid="menu-request-undo"
              >
                {undoPending ? 'Undo Requested...' : 'Request Undo'}
              </button>
              <button role="menuitem" onClick={runAndClose(onOpenStandings)} className={MENU_ITEM} data-testid="menu-standings">
                Standings
              </button>
              <button role="menuitem" onClick={runAndClose(onOpenActivity)} className={MENU_ITEM} data-testid="menu-activity">
                Activity Log
              </button>

              <div className="my-1 border-t-2 border-dashed border-ink/30" />
              <button role="menuitemcheckbox" aria-checked={soundOn} onClick={() => toggle('soundOn')} className={MENU_ITEM} data-testid="menu-sound">
                Sound <span className="font-display text-xs uppercase">{soundOn ? 'On' : 'Off'}</span>
              </button>
              <button role="menuitemcheckbox" aria-checked={hapticsOn} onClick={() => toggle('hapticsOn')} className={MENU_ITEM} data-testid="menu-haptics">
                Vibration <span className="font-display text-xs uppercase">{hapticsOn ? 'On' : 'Off'}</span>
              </button>
              <button role="menuitemcheckbox" aria-checked={reduceMotion} onClick={() => toggle('reduceMotion')} className={MENU_ITEM} data-testid="menu-motion">
                Reduce Motion <span className="font-display text-xs uppercase">{reduceMotion ? 'On' : 'Off'}</span>
              </button>

              {(onOpenSeatOrder || onRestartHand) && (
                <>
                  <div className="my-1 border-t-2 border-dashed border-ink/30" />
                  <p className="px-4 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-widest text-ink-soft">Host tools</p>
                </>
              )}
              {onOpenSeatOrder && (
                <button role="menuitem" onClick={runAndClose(onOpenSeatOrder)} className={MENU_ITEM} data-testid="menu-seat-order">
                  Seating Order
                </button>
              )}
              {onRestartHand && (
                <button role="menuitem" onClick={runAndClose(onRestartHand)} className={MENU_ITEM} data-testid="menu-restart-hand">
                  Restart Hand
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
```

### Step 3.20: Replace `src/frontend/src/components/ActivityStrip.tsx`

```tsx
import { Megaphone, ChevronRight } from 'lucide-react'
import { formatActivityEntry } from '@/lib/activityFormat'
import type { ActivityEntry } from '@/types/game'

interface ActivityStripProps {
  entries: ActivityEntry[]
  onOpenHistory: () => void
}

/** Ticker under the header with the latest table event; tap to open the full log. */
export function ActivityStrip({ entries, onOpenHistory }: ActivityStripProps) {
  // Find the most recent non-undone entry
  const mostRecentEntry = entries.findLast((entry) => !entry.isUndone)

  // Don't show the strip if there are no non-undone entries
  if (!mostRecentEntry) {
    return null
  }

  return (
    <button
      data-testid="activity-strip"
      onClick={onOpenHistory}
      aria-label="Activity history"
      className="flex w-full shrink-0 items-center gap-2 border-y-[3px] border-ink bg-mustard px-3 py-1.5 text-left text-ink transition-[filter] hover:brightness-105"
    >
      <Megaphone aria-hidden="true" size={16} className="shrink-0 -rotate-12" />
      <span
        key={mostRecentEntry.sequence}
        data-testid="activity-strip-text"
        className="animate-slide-in min-w-0 flex-1 truncate text-sm font-semibold"
      >
        {formatActivityEntry(mostRecentEntry)}
      </span>
      <ChevronRight aria-hidden="true" size={16} className="shrink-0" />
    </button>
  )
}
```

### Step 3.21: Replace `src/frontend/src/pages/GamePage.tsx`

```tsx
import { useParams } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useRoomEvents } from '../hooks/useRoomEvents';
import { useGameCommands } from '../hooks/useGameCommands';
import { useWakeLock } from '../hooks/useWakeLock';
import { useTableEvents } from '../hooks/useTableEvents';
import { useTurnTitle } from '../hooks/useTurnTitle';
import { PokerAction } from '../types/game';
import type { PotAward } from '../types/game';
import PokerTable from '../components/table/PokerTable';
import HeroPanel from '../components/table/HeroPanel';
import ActionBar from '../components/ActionBar';
import GameHeader from '../components/GameHeader';
import UndoDialog from '../components/UndoDialog';
import ShowdownDialog from '../components/ShowdownDialog';
import RebuyDialog from '../components/RebuyDialog';
import SeatOrderDialog from '../components/SeatOrderDialog';
import RestartHandDialog from '../components/RestartHandDialog';
import StandingsDialog from '../components/StandingsDialog';
import { ActivityStrip } from '../components/ActivityStrip';
import { ActivityHistoryModal } from '../components/ActivityHistoryModal';
import { ChipLogoMark } from '../components/ChipLogo';
import Avatar from '../components/ui/Avatar';
import RetroButton from '../components/ui/RetroButton';
import { recallPlayer, rememberPlayer } from '../lib/identity';
import { opponentsInSeatOrder } from '../lib/seating';
import { playSound } from '../lib/sound';
import { HAPTICS, vibrate } from '../lib/haptics';
import { formatMoney } from '@/lib/utils';

const NOTICE = 'mx-3 mb-2 rounded-xl border-[3px] border-ink bg-card px-3 py-2 text-center text-sm font-semibold text-ink shadow-hard-sm';

export default function GamePage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const {
    playerId,
    creatorPlayerId,
    gameState,
    isConnected,
    undoDeclined,
    roomSettings,
    error,
    setRoomCode,
    setPlayerId,
    setIsCreator,
    setUndoDeclined,
  } = useGameStore();
  useRoomEvents(roomCode, playerId);
  const { submitAction, requestUndo, approveUndo, declineUndo, cancelUndo, resolveShowdown, resolveSplitPot, resolveShowdownWithAwards, rebuy, declineRebuy, reorderSeats, restartHand } = useGameCommands();
  // The undo prompt is derived from the snapshot, so a resync restores it after a missed push.
  const undoRequested = gameState?.pendingUndoRequestBy ?? null;
  const undoPendingSelf = !!playerId && undoRequested === playerId;
  const isAdmin = !!playerId && playerId === creatorPlayerId;
  const [showUndoDialog, setShowUndoDialog] = useState(false);
  const [showShowdownDialog, setShowShowdownDialog] = useState(false);
  const [showActivityHistory, setShowActivityHistory] = useState(false);
  const [showSeatOrderDialog, setShowSeatOrderDialog] = useState(false);
  const [showRestartHandDialog, setShowRestartHandDialog] = useState(false);
  const [showStandings, setShowStandings] = useState(false);
  // AN-8: error shake key — increment to replay animation on each new error
  const [errorKey, setErrorKey] = useState(0);
  // SD-5: winner highlight in the showdown dialog
  const [celebratingWinnerId, setCelebratingWinnerId] = useState<string | null>(null);
  // A11Y-6: screen reader announcements
  const [announcement, setAnnouncement] = useState('');
  const prevActiveRef = useRef<string | null>(null);
  const prevPhaseRef = useRef<string | null>(null);

  // Memoize recent activity to prevent unnecessary re-renders and modal dependency loops
  const recentActivity = useMemo(() => gameState?.recentActivity ?? [], [gameState?.recentActivity]);

  const announce = useCallback((message: string) => setAnnouncement(message), []);
  const { bubbles, wins, splash } = useTableEvents(gameState, playerId, announce);

  const isYourTurn = !!playerId && !!gameState && gameState.activePlayerTurnId === playerId;
  useTurnTitle(isYourTurn);

  // MB-5: keep screen awake during active game
  useWakeLock();

  useEffect(() => {
    if (!roomCode) return;
    setRoomCode(roomCode);

    if (!playerId) {
      const remembered = recallPlayer(roomCode);
      if (remembered) {
        setPlayerId(remembered.playerId);
        setIsCreator(remembered.isCreator);
      }
    }
  }, [roomCode, playerId, setRoomCode, setPlayerId, setIsCreator]);

  useEffect(() => {
    if (undoRequested && playerId && undoRequested !== playerId) {
      setShowUndoDialog(true);
    } else {
      setShowUndoDialog(false);
    }
  }, [undoRequested, playerId]);

  useEffect(() => {
    if (undoDeclined) {
      const timer = setTimeout(() => setUndoDeclined(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [undoDeclined, setUndoDeclined]);

  // AN-8: increment error key to replay shake animation on each new error
  useEffect(() => {
    if (!error) return;
    setErrorKey(k => k + 1);
    playSound('error');
    vibrate(HAPTICS.error);
  }, [error]);

  // A11Y-6: announce turn changes and phase changes to screen readers
  useEffect(() => {
    if (!gameState) return;
    const { activePlayerTurnId, phase, players } = gameState;

    if (phase !== prevPhaseRef.current && prevPhaseRef.current !== null) {
      setAnnouncement(`Phase: ${phase}`);
    } else if (activePlayerTurnId && activePlayerTurnId !== prevActiveRef.current) {
      const active = players.find(p => p.playerId === activePlayerTurnId);
      if (active) setAnnouncement(active.playerId === playerId ? 'Your turn' : `${active.name}'s turn`);
    }

    prevActiveRef.current = activePlayerTurnId ?? null;
    prevPhaseRef.current = phase;
  }, [gameState, playerId]);

  useEffect(() => {
    if (!announcement) return;
    const t = setTimeout(() => setAnnouncement(''), 3000);
    return () => clearTimeout(t);
  }, [announcement]);

  useEffect(() => {
    // Open only when the hand actually ended at Showdown awaiting a winner selection.
    // (!isHandActive alone is not enough — it's also true while waiting on a busted
    // player's rebuy decision, which has its own dialog and no pots left to resolve.)
    if (gameState && gameState.phase === 'Showdown' && !gameState.isHandActive) {
      setShowShowdownDialog(true);
    } else if (gameState && gameState.phase !== 'Showdown') {
      // Showdown was resolved (new hand started, or blocked awaiting a rebuy decision that
      // resets Phase back to PreFlop) — close the showdown dialog either way.
      setShowShowdownDialog(false);
    }
  }, [gameState]);

  if (!gameState) {
    return (
      <div className="flex h-[100dvh] items-center justify-center px-4">
        <div className="retro-panel flex flex-col items-center gap-3 px-8 py-6 text-center">
          <ChipLogoMark size={64} className="animate-spin-slow" />
          <h1 className="font-display text-3xl uppercase tracking-wide text-ink">Deal Me In</h1>
          <p className="animate-pulse font-display text-ink-soft">Connecting to game...</p>
          {error && <p className="text-sm font-semibold text-tomato-deep">{error}</p>}
        </div>
      </div>
    );
  }

  const currentPlayer = gameState.players.find(p => p.playerId === playerId);
  const heroSeatIndex = gameState.players.findIndex(p => p.playerId === playerId);
  const otherPlayers = opponentsInSeatOrder(gameState.players, playerId);
  const seatedPlayers = gameState.players.filter(p => !p.isEliminated);
  const othersAwaitingRebuy = otherPlayers.filter(p => p.isAwaitingRebuy);
  const showRebuyDialog = !!currentPlayer?.isAwaitingRebuy;
  const waitingForPlayers = !gameState.isHandActive && !showRebuyDialog && othersAwaitingRebuy.length === 0 && seatedPlayers.length < 2;
  const seatOrderPending = !!gameState.pendingSeatOrder?.length;
  // Mirrors the server: nothing to restart while the table waits on a rebuy decision or players.
  const canRestartHand = gameState.isHandActive || gameState.phase === 'Showdown'
    || (seatedPlayers.length >= 2 && !seatedPlayers.some(p => p.isAwaitingRebuy));

  const handleAction = (action: PokerAction, amount?: number) => {
    if (playerId && roomCode) {
      submitAction(roomCode, playerId, action, amount);
    }
  };

  const handlePickPlayer = (pickedPlayerId: string) => {
    if (!roomCode) return;
    const pickedIsCreator = pickedPlayerId === creatorPlayerId;
    rememberPlayer(roomCode, pickedPlayerId, pickedIsCreator);
    setPlayerId(pickedPlayerId);
    setIsCreator(pickedIsCreator);
  };

  const handleSaveSeatOrder = (orderedPlayerIds: string[]) => {
    if (playerId && roomCode) {
      reorderSeats(roomCode, playerId, orderedPlayerIds);
    }
    setShowSeatOrderDialog(false);
  };

  const handleConfirmRestartHand = () => {
    if (playerId && roomCode) {
      restartHand(roomCode, playerId);
    }
    setShowRestartHandDialog(false);
  };

  const handleApproveUndo = () => {
    if (playerId && roomCode) {
      approveUndo(roomCode, playerId);
      setShowUndoDialog(false);
    }
  };

  const handleDeclineUndo = () => {
    if (playerId && roomCode && undoRequested) {
      declineUndo(roomCode, playerId);
    }
    setShowUndoDialog(false);
  };

  const handleCancelUndo = () => {
    if (playerId && roomCode) {
      cancelUndo(roomCode, playerId);
    }
  };

  const handleSelectWinner = (winnerId: string) => {
    if (roomCode) {
      // SD-5: highlight the winner for 1.5s before resolving; the winner's own device
      // celebrates (confetti, sound) when the PotWon event arrives.
      setCelebratingWinnerId(winnerId);
      setTimeout(() => {
        resolveShowdown(roomCode, winnerId);
        setShowShowdownDialog(false);
        setCelebratingWinnerId(null);
      }, 1500);
    }
  };

  const handleSplitPot = () => {
    if (roomCode) {
      resolveSplitPot(roomCode);
      setShowShowdownDialog(false);
    }
  };

  const handleResolveAwards = (awards: PotAward[]) => {
    if (roomCode) {
      resolveShowdownWithAwards(roomCode, awards);
      setShowShowdownDialog(false);
    }
  };

  const handleRequestUndo = () => {
    if (playerId && roomCode) {
      requestUndo(roomCode, playerId);
    }
  };

  const handleRebuy = () => {
    if (playerId && roomCode) {
      rebuy(roomCode, playerId);
    }
  };

  const handleCashOut = () => {
    if (playerId && roomCode) {
      declineRebuy(roomCode, playerId);
    }
  };

  return (
    <div className="flex flex-col" style={{ height: '100dvh', overflow: 'hidden' }} data-testid="game-page">
      <GameHeader
        roomCode={roomCode ?? ''}
        isConnected={isConnected}
        undoPending={undoPendingSelf}
        onRequestUndo={handleRequestUndo}
        onOpenStandings={() => setShowStandings(true)}
        onOpenActivity={() => setShowActivityHistory(true)}
        onOpenSeatOrder={isAdmin ? () => setShowSeatOrderDialog(true) : undefined}
        onRestartHand={isAdmin && canRestartHand ? () => setShowRestartHandDialog(true) : undefined}
      />

      {/* GP-27: Undo request sent — top toast banner */}
      {undoPendingSelf && (
        <div data-testid="undo-pending" className="animate-slide-down flex shrink-0 items-center justify-between gap-3 border-b-[3px] border-ink bg-bubblegum px-4 py-2">
          <span className="animate-ellipsis text-sm font-semibold text-ink">Undo requested. Waiting for approval</span>
          <RetroButton size="sm" onClick={handleCancelUndo} data-testid="undo-cancel" className="min-h-8 shrink-0 px-2 text-xs">
            Cancel
          </RetroButton>
        </div>
      )}

      {/* A11Y-6: sr-only live region. Never put amounts, "dealer" or "all in" here (e2e getByText). */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</div>

      <ActivityStrip entries={recentActivity} onOpenHistory={() => setShowActivityHistory(true)} />

      <main className="flex min-h-0 flex-1 flex-col landscape-short:flex-row">
        {/* Table stage */}
        <section className="relative min-h-0 flex-1 px-1 pb-2 pt-6 landscape-short:pt-4">
          <PokerTable gameState={gameState} playerId={playerId} bubbles={bubbles} wins={wins} splash={splash} />
        </section>

        {/* Hero dock: notices, your seat, actions */}
        <section className="mx-auto w-full max-w-2xl shrink-0 landscape-short:mx-0 landscape-short:flex landscape-short:w-[340px] landscape-short:max-w-none landscape-short:flex-col landscape-short:justify-end landscape-short:overflow-y-auto landscape-short:border-l-[3px] landscape-short:border-ink">
          {/* No remembered identity on this device: let the player take their seat back */}
          {!playerId && (
            <div data-testid="pick-player" className={NOTICE}>
              <p className="mb-2 text-ink-soft">You're watching. Tap your name to take your seat:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {gameState.players.map((p, idx) => (
                  <RetroButton key={p.playerId} size="sm" onClick={() => handlePickPlayer(p.playerId)} className="gap-1.5 pl-1.5">
                    <Avatar name={p.name} colorIndex={idx} size="sm" />
                    {p.name}
                  </RetroButton>
                ))}
              </div>
            </div>
          )}

          {/* Seating change queued by the room creator */}
          {seatOrderPending && (
            <div data-testid="seat-order-pending" className={NOTICE}>
              New seating order starts next hand
            </div>
          )}

          {/* Waiting on another player's rebuy decision */}
          {othersAwaitingRebuy.length > 0 && (
            <div data-testid="waiting-for-rebuy" className={`${NOTICE} animate-pulse`}>
              Waiting for {othersAwaitingRebuy.map(p => p.name).join(', ')} to buy back in...
            </div>
          )}

          {/* Not enough seated players to continue */}
          {waitingForPlayers && (
            <div data-testid="waiting-for-players" className={NOTICE}>
              Waiting for more players to join or buy back in...
            </div>
          )}

          {/* Eliminated player — persistent option to buy back in */}
          {currentPlayer?.isEliminated && (
            <div className="mx-3 mb-2">
              <RetroButton data-testid="buy-back-in-button" tone="teal" size="lg" block onClick={handleRebuy}>
                {roomSettings ? `Buy Back In for ${formatMoney(roomSettings.startingStack)}` : 'Buy Back In'}
              </RetroButton>
            </div>
          )}

          {/* AN-8: error banner with shake animation */}
          {error && (
            <div
              key={errorKey}
              role="alert"
              className="animate-shake mx-3 mb-2 rounded-xl border-[3px] border-ink bg-tomato-deep px-4 py-2 text-sm font-semibold text-paper"
            >
              {error}
            </div>
          )}

          {/* Undo declined notification */}
          {undoDeclined && (
            <div className={`${NOTICE} text-tomato-deep`}>
              Undo was declined by other player.
            </div>
          )}

          {currentPlayer && (
            <HeroPanel
              player={currentPlayer}
              colorIndex={heroSeatIndex}
              isActive={isYourTurn}
              bubble={playerId ? bubbles[playerId] : undefined}
              win={playerId ? wins[playerId] : undefined}
            />
          )}

          <ActionBar
            gameState={gameState}
            playerId={playerId}
            onAction={handleAction}
            isYourTurn={isYourTurn}
          />
        </section>
      </main>

      {/* Dialogs */}
      {showUndoDialog && undoRequested && (
        <UndoDialog
          requestingPlayerName={
            gameState.players.find(p => p.playerId === undoRequested)?.name || 'Other player'
          }
          onApprove={handleApproveUndo}
          onDecline={handleDeclineUndo}
        />
      )}

      {showShowdownDialog && (
        <ShowdownDialog
          gameState={gameState}
          onSelectWinner={handleSelectWinner}
          onSplitPot={handleSplitPot}
          onResolveAwards={handleResolveAwards}
          celebratingWinnerId={celebratingWinnerId}
        />
      )}

      {showRebuyDialog && roomSettings && (
        <RebuyDialog
          startingStack={roomSettings.startingStack}
          onRebuy={handleRebuy}
          onCashOut={handleCashOut}
        />
      )}

      {showSeatOrderDialog && isAdmin && (
        <SeatOrderDialog
          players={gameState.players}
          pendingOrder={gameState.pendingSeatOrder}
          onSave={handleSaveSeatOrder}
          onClose={() => setShowSeatOrderDialog(false)}
        />
      )}

      {showRestartHandDialog && isAdmin && (
        <RestartHandDialog
          onConfirm={handleConfirmRestartHand}
          onCancel={() => setShowRestartHandDialog(false)}
        />
      )}

      {showStandings && (
        <StandingsDialog players={gameState.players} onClose={() => setShowStandings(false)} />
      )}

      {/* Activity history modal */}
      <ActivityHistoryModal
        open={showActivityHistory}
        onOpenChange={setShowActivityHistory}
        roomCode={roomCode ?? ''}
        fallbackEntries={recentActivity}
      />
    </div>
  );
}
```

### Step 3.22: Delete the replaced game components

These are fully replaced by `components/table/*`, and nothing imports them after Step 3.21.

- Delete `src/frontend/src/components/PlayerPanel.tsx`
- Delete `src/frontend/src/components/PotDisplay.tsx`
- Delete `src/frontend/src/components/PhaseStepper.tsx`

---

## Verify (from `src/frontend`)

```powershell
npx tsc -b
npm run lint
npm test
```

Expected: all exit 0, and `npm test` reports **78 passed**. That is the 68 from before plus 5 table-layout, 2 standings and 3 table-events tests.
