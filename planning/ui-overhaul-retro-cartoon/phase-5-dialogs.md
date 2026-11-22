# Phase 5: Dialogs and Banners

**Goal:** Restyle the remaining modal surfaces on the shared cartoon `DialogShell`. That is a cream card with a tilted mustard title sticker, popping in over a dimmed table.

- **Showdown:**
  - Winner buttons carry avatars.
  - The chosen winner gets a gold glow and a "Winner!" shout during the existing 1.5 s pause.
  - Side pots show a progress-dot row.
- **Rebuy, Restart Hand:** restyled.
- **Undo request banner:** gains a draining 15 s "fuse" bar that shows the existing auto-decline timer.
- **Activity log:**
  - Per-hand cards with colour-coded dots by action.
  - Rendered through `DialogShell`.
  - Keeps every DOM fact the unit and e2e tests rely on (02, §3).

`GamePage` (phase 3) no longer fires confetti when a winner is picked. The winner's own device celebrates when the `PotWon` event arrives (`useTableEvents`). No change is needed here.

---

### Step 5.1: Replace `src/frontend/src/components/ShowdownDialog.tsx`

```tsx
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
```

### Step 5.2: Replace `src/frontend/src/components/RebuyDialog.tsx`

```tsx
import { Coins } from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import { DialogShell } from './DialogShell';
import RetroButton from './ui/RetroButton';

interface RebuyDialogProps {
  startingStack: number;
  onRebuy: () => void;
  onCashOut: () => void;
}

/** Blocking prompt shown to a player whose stack hit zero: buy back in or leave the table. */
export default function RebuyDialog({ startingStack, onRebuy, onCashOut }: RebuyDialogProps) {
  return (
    <DialogShell
      isFixed={true}
      title="You're Out of Chips"
      testId="rebuy-dialog"
      showCloseButton={false}
      centerTitle
      ariaDescribedBy="rebuy-description"
    >
      <div aria-hidden="true" className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full border-[3px] border-ink bg-paper shadow-hard-sm">
        <Coins size={30} className="text-ink" />
      </div>
      <p id="rebuy-description" className="mb-5 text-center text-sm text-ink-soft">
        Buy back in for {formatMoney(startingStack)}, or cash out and leave the table.
      </p>
      <div className="space-y-3">
        <RetroButton block size="lg" tone="teal" data-testid="rebuy-confirm" onClick={onRebuy}>
          Buy In for {formatMoney(startingStack)}
        </RetroButton>
        <RetroButton block size="md" tone="cream" data-testid="rebuy-decline" onClick={onCashOut}>
          Cash Out
        </RetroButton>
      </div>
    </DialogShell>
  );
}
```

### Step 5.3: Replace `src/frontend/src/components/RestartHandDialog.tsx`

```tsx
import { DialogShell } from './DialogShell';
import RetroButton from './ui/RetroButton';

interface RestartHandDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
}

/** Room creator's confirmation before abandoning and re-dealing the current hand. */
export default function RestartHandDialog({ onConfirm, onCancel }: RestartHandDialogProps) {
  return (
    <DialogShell
      title="Restart Hand"
      testId="restart-hand-dialog"
      onOpenChange={(open) => !open && onCancel()}
      ariaDescribedBy="restart-hand-description"
    >
      <p id="restart-hand-description" className="mb-5 text-sm text-ink-soft">
        Every bet made this hand goes back to the player who made it. The same dealer deals again
        and the blinds are re-posted. Players, stacks and seats are kept. This can't be undone.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <RetroButton tone="cream" onClick={onCancel}>
          Cancel
        </RetroButton>
        <RetroButton tone="tomato" data-testid="restart-hand-confirm" onClick={onConfirm}>
          Restart Hand
        </RetroButton>
      </div>
    </DialogShell>
  );
}
```

### Step 5.4: Replace `src/frontend/src/components/UndoDialog.tsx`

```tsx
import { useEffect } from 'react';
import RetroButton from './ui/RetroButton';

const AUTO_DECLINE_MS = 15000;

interface UndoDialogProps {
  requestingPlayerName: string;
  onApprove: () => void;
  onDecline: () => void;
}

// GP-28: Slide-down banner instead of a blocking modal. Auto-declines after 15s (shown as a draining fuse).
export default function UndoDialog({ requestingPlayerName, onApprove, onDecline }: UndoDialogProps) {
  useEffect(() => {
    const timer = setTimeout(onDecline, AUTO_DECLINE_MS);
    return () => clearTimeout(timer);
  }, [onDecline]);

  return (
    <div
      role="alertdialog"
      data-testid="undo-dialog"
      aria-label="Undo request"
      aria-describedby="undo-banner-desc"
      className="animate-slide-down fixed inset-x-0 top-0 z-50 border-b-[3px] border-ink bg-mustard px-4 pb-3 shadow-hard"
      style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
    >
      <p id="undo-banner-desc" className="mb-2 font-display text-base text-ink">
        {requestingPlayerName} wants to undo the last action
      </p>
      <div aria-hidden="true" className="mb-2 h-2 overflow-hidden rounded-full border-2 border-ink bg-card">
        <div className="keep-visible-reduced animate-countdown h-full bg-tomato" style={{ animationDuration: `${AUTO_DECLINE_MS}ms` }} />
      </div>
      <div className="flex gap-2">
        <RetroButton tone="tomato" size="sm" className="flex-1" onClick={onDecline}>
          Decline
        </RetroButton>
        <RetroButton tone="teal" size="sm" className="flex-1" onClick={onApprove}>
          Approve
        </RetroButton>
      </div>
    </div>
  );
}
```

### Step 5.5: Replace `src/frontend/src/components/ActivityHistoryModal.tsx`

```tsx
import { useEffect, useState, useRef } from 'react'
import { formatActivityEntry } from '@/lib/activityFormat'
import { cn } from '@/lib/utils'
import type { ActivityEntry } from '@/types/game'
import { DialogShell } from './DialogShell'

interface ActivityHistoryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  roomCode: string
  fallbackEntries: ActivityEntry[]
}

interface GroupedEntries {
  handNumber: number
  entries: ActivityEntry[]
}

const DOT_BY_ACTION: Record<string, string> = {
  Fold: 'bg-tomato',
  Check: 'bg-teal',
  Call: 'bg-royal',
  Bet: 'bg-mustard',
  Raise: 'bg-mustard',
  AllIn: 'bg-grape',
}

function dotClass(entry: ActivityEntry): string {
  if (entry.entryType === 'PlayerAction' && entry.action) return DOT_BY_ACTION[entry.action] ?? 'bg-card'
  if (entry.entryType === 'PotWon') return 'bg-mustard'
  return 'bg-card'
}

export function ActivityHistoryModal({
  open,
  onOpenChange,
  roomCode,
  fallbackEntries,
}: ActivityHistoryModalProps) {
  const [entries, setEntries] = useState<ActivityEntry[]>(fallbackEntries)
  const [loading, setLoading] = useState(false)
  const fallbackEntriesRef = useRef(fallbackEntries)

  useEffect(() => {
    fallbackEntriesRef.current = fallbackEntries
  }, [fallbackEntries])

  useEffect(() => {
    if (!open) {
      return
    }

    setLoading(true)
    const apiUrl = import.meta.env.VITE_API_URL ?? ''
    fetch(`${apiUrl}/api/rooms/${roomCode}/activity`)
      .then((res) => res.json())
      .then((data) => {
        setEntries(data.entries || [])
      })
      .catch(() => {
        // Use fallback entries on error
        setEntries(fallbackEntriesRef.current)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [open, roomCode])

  // Group entries by handNumber, descending, and reverse within each group
  const grouped: GroupedEntries[] = []
  const handMap = new Map<number, ActivityEntry[]>()

  for (const entry of entries) {
    const handNum = entry.handNumber ?? 0
    if (!handMap.has(handNum)) {
      handMap.set(handNum, [])
    }
    handMap.get(handNum)!.push(entry)
  }

  // Sort hands descending and reverse entries within each hand (newest first)
  Array.from(handMap.entries())
    .sort(([a], [b]) => b - a)
    .forEach(([handNumber, handEntries]) => {
      grouped.push({
        handNumber,
        entries: handEntries.reverse(),
      })
    })

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Activity History"
      testId="activity-history-modal"
      sizeClass="max-w-lg"
      closeLabel="Close activity history"
    >
      {loading && (
        <div className="py-4 text-center font-display text-ink-soft">
          Loading activity history...
        </div>
      )}

      {!loading && entries.length === 0 && (
        <div className="py-4 text-center text-ink-soft">
          No activity history yet.
        </div>
      )}

      {!loading && entries.length > 0 && (
        <div className="space-y-3">
          {grouped.map(({ handNumber, entries: handEntries }) => (
            <section key={handNumber} className="rounded-xl border-[3px] border-ink bg-paper p-3 shadow-hard-sm">
              <h3 className="mb-2 inline-block rounded-full border-2 border-ink bg-ink px-2.5 font-display text-sm uppercase tracking-wider text-paper">
                Hand {handNumber}
              </h3>
              <ol className="space-y-1">
                {handEntries.map((entry, idx) => (
                  <li
                    key={idx}
                    data-testid={`activity-entry-${handNumber}-${idx}`}
                    className={cn('flex items-start gap-2 text-sm text-ink', entry.isUndone && 'line-through opacity-50')}
                  >
                    <span aria-hidden="true" className={cn('mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-ink', dotClass(entry))} />
                    {formatActivityEntry(entry)}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </DialogShell>
  )
}
```

---

## Verify (from `src/frontend`)

```powershell
npx tsc -b
npm run lint
npm test
```

Expected: all exit 0, and `npm test` reports **83 passed**.

### Stale-token check (from the repository root)

No file may still use the old design tokens. Every class below was deleted from `@theme` in phase 1, and a leftover would render unstyled.

```powershell
Get-ChildItem -Recurse -Path src\frontend\src -Include *.ts,*.tsx,*.css | Select-String -CaseSensitive -Pattern "surface-(bg|card|elevated)|accent-(primary|danger|warning|info|bet|raise)|text-text-|-gold\b|font-mono|JetBrains|'Inter'"
```

Expected: **no output**. Before this overhaul the same command printed 216 matches.
