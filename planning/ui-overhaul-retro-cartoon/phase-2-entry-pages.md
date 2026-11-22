# Phase 2: Entry Pages (Create, Join, Lobby, Seating)

**Goal:** Restyle the pre-game flow.

- **Create page:** mascot logo on a sunburst, "Pick your stakes" chip presets, and a 3-step "how it works" strip.
- **Join page:** a big letter-spaced room-code entry.
- **Lobby:**
  - a ticket-style room code
  - stake/blind pills
  - a polaroid QR code with a share button
  - a 9-seat fill strip
  - player rows with avatar, Host and You pills
  - a sticky mustard Start button
- **Seating dialog:** restyled. Its `SeatMoveButtons` export is reused by the lobby.

Behavioural notes:
- `StepperInput` moves out of `CreateRoomPage` to module scope. It was previously re-created on every render, which drops input focus while typing.
- The collapsed Custom Setup section is `inert`, so hidden inputs are not tabbable.
- The lobby now shows store errors (start game, reorder) in a banner. Those errors were previously set but never displayed on that page.

---

### Step 2.1: Replace `src/frontend/src/components/SeatOrderDialog.tsx`

```tsx
import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { DialogShell } from './DialogShell';
import { moveSeat } from '../lib/seating';
import type { Player } from '../types/game';
import Avatar from './ui/Avatar';
import DealerChip from './ui/DealerChip';
import RetroButton from './ui/RetroButton';

interface SeatMoveButtonsProps {
  name: string;
  index: number;
  count: number;
  disabled?: boolean;
  onMove: (delta: -1 | 1) => void;
}

const MOVE_BTN = 'retro-btn h-9 w-9 bg-card text-ink shadow-hard-sm';

/** Up/down controls for moving one player in the seating order. */
export function SeatMoveButtons({ name, index, count, disabled, onMove }: SeatMoveButtonsProps) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onMove(-1)}
        disabled={disabled || index === 0}
        aria-label={`Move ${name} up`}
        className={MOVE_BTN}
      >
        <ChevronUp aria-hidden="true" size={18} />
      </button>
      <button
        type="button"
        onClick={() => onMove(1)}
        disabled={disabled || index === count - 1}
        aria-label={`Move ${name} down`}
        className={MOVE_BTN}
      >
        <ChevronDown aria-hidden="true" size={18} />
      </button>
    </div>
  );
}

interface SeatOrderDialogProps {
  /** Players in the current table order. */
  players: Player[];
  /** Order already queued for the next hand, if any. */
  pendingOrder?: string[] | null;
  onSave: (orderedPlayerIds: string[]) => void;
  onClose: () => void;
}

/** Room creator's in-game editor for the clockwise seating order. */
export default function SeatOrderDialog({ players, pendingOrder, onSave, onClose }: SeatOrderDialogProps) {
  const [initial] = useState(() =>
    pendingOrder && pendingOrder.length === players.length ? pendingOrder : players.map(p => p.playerId),
  );
  const [order, setOrder] = useState<string[]>(initial);
  const byId = new Map(players.map(p => [p.playerId, p]));
  const seatIndexOf = (id: string) => players.findIndex(p => p.playerId === id);
  const changed = order.some((id, i) => id !== initial[i]);

  return (
    <DialogShell
      title="Seating"
      testId="seat-order-dialog"
      onOpenChange={(open) => !open && onClose()}
      ariaDescribedBy="seat-order-description"
    >
      <p id="seat-order-description" className="mb-4 text-sm text-ink-soft">
        List players clockwise around the table. The new order starts with the next hand, and the
        dealer button stays with the same player.
      </p>
      <ol className="mb-5 space-y-2">
        {order.map((id, idx) => {
          const player = byId.get(id);
          if (!player) return null;
          return (
            <li
              key={id}
              data-testid={`seat-row-${id}`}
              className="flex items-center gap-2.5 rounded-xl border-[3px] border-ink bg-paper py-1.5 pl-2 pr-1.5 shadow-hard-sm"
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink font-display text-xs text-paper">
                {idx + 1}
              </span>
              <Avatar name={player.name} colorIndex={seatIndexOf(id)} size="sm" />
              <span className="min-w-0 flex-1 truncate font-display text-ink">{player.name}</span>
              {player.isDealer && <DealerChip variant="puck" />}
              <SeatMoveButtons
                name={player.name}
                index={idx}
                count={order.length}
                onMove={(delta) => setOrder(o => moveSeat(o, idx, delta))}
              />
            </li>
          );
        })}
      </ol>
      <div className="grid grid-cols-2 gap-3">
        <RetroButton tone="cream" onClick={onClose}>
          Cancel
        </RetroButton>
        <RetroButton tone="teal" data-testid="seat-order-save" onClick={() => onSave(order)} disabled={!changed}>
          Save
        </RetroButton>
      </div>
    </DialogShell>
  );
}
```

### Step 2.2: Replace `src/frontend/src/pages/CreateRoomPage.tsx`

```tsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import type { CreateRoomRequest, CreateRoomResponse } from '../types/game';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import ChipLogo from '../components/ChipLogo';
import ChipStack from '../components/ui/ChipStack';
import RetroButton from '../components/ui/RetroButton';
import { useApiWarmUp } from '../hooks/useApiWarmUp';

type PresetId = 'casual' | 'standard' | 'deep';

const PRESETS: { id: PresetId; label: string; stack: number; sb: number; bb: number; desc: string; chips: number }[] = [
  { id: 'casual',   label: 'Casual',     stack: 1000, sb: 5,  bb: 10, desc: '1,000 · 5/10',  chips: 1 },
  { id: 'standard', label: 'Standard',   stack: 1000, sb: 10, bb: 20, desc: '1,000 · 10/20', chips: 3 },
  { id: 'deep',     label: 'Deep Stack', stack: 5000, sb: 25, bb: 50, desc: '5,000 · 25/50', chips: 5 },
];

const HOW_IT_WORKS = [
  { n: 1, text: 'Create a table' },
  { n: 2, text: 'Friends scan the QR code' },
  { n: 3, text: 'Deal real cards. We count the chips.' },
];

interface StepperInputProps {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  error?: string | null;
}

function StepperInput({ id, label, value, onChange, min = 1, step = 5, error }: StepperInputProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block font-display text-sm uppercase tracking-wide text-ink">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <RetroButton
          size="sm"
          onClick={() => onChange(Math.max(min, value - step))}
          aria-label={`Decrease ${label}`}
          className="h-11 w-11 shrink-0 px-0 text-xl"
        >
          −
        </RetroButton>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          value={value}
          onChange={(e) => onChange(Math.max(min, parseInt(e.target.value) || min))}
          className={cn(
            'retro-input min-w-0 flex-1 px-3 py-2 text-center font-display text-lg tabular-nums',
            error && 'border-tomato-deep',
          )}
        />
        <RetroButton
          size="sm"
          onClick={() => onChange(value + step)}
          aria-label={`Increase ${label}`}
          className="h-11 w-11 shrink-0 px-0 text-xl"
        >
          +
        </RetroButton>
      </div>
      {error && <p className="mt-1 text-xs font-semibold text-tomato-deep">{error}</p>}
    </div>
  );
}

export default function CreateRoomPage() {
  useApiWarmUp();
  const navigate = useNavigate();
  const [startingStack, setStartingStack] = useState(1000);
  const [smallBlind, setSmallBlind] = useState(10);
  const [bigBlind, setBigBlind] = useState(20);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<PresetId | null>('standard');
  // CR-4: collapsible custom form — collapsed when preset is active
  const [isCustomOpen, setIsCustomOpen] = useState(false);

  const apiUrl = import.meta.env.VITE_API_URL ?? '';

  // Inline validation errors
  const stackError = startingStack < bigBlind ? 'Stack must be at least the big blind' : null;
  const sbError = smallBlind >= bigBlind ? 'Small blind must be less than big blind' : null;
  const hasValidationError = !!(stackError || sbError);

  const handlePreset = (preset: typeof PRESETS[0]) => {
    setSelectedPreset(preset.id);
    setStartingStack(preset.stack);
    setSmallBlind(preset.sb);
    setBigBlind(preset.bb);
    setLocalError(null);
    setIsCustomOpen(false);
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasValidationError) return;
    setLoading(true);
    setLocalError(null);

    try {
      const request: CreateRoomRequest = { startingStack, smallBlind, bigBlind };

      const res = await fetch(`${apiUrl}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      const data: CreateRoomResponse = await res.json();

      if (data.success && data.roomCode) {
        navigate(`/room/${data.roomCode}/lobby`);
      } else {
        setLocalError(data.error || 'Failed to create room');
      }
    } catch (err) {
      setLocalError(`Failed to reach server: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 px-4 py-8">
      <ChipLogo />
      <p className="-mt-1 text-center font-display text-base text-ink-soft">2–9 players · No app required</p>

      <div className="retro-panel w-full max-w-md p-5">
        <h2 className="mb-3 font-display text-xl uppercase tracking-wide text-ink">Pick your stakes</h2>

        {/* Quick-start presets */}
        <div className="mb-5 grid grid-cols-3 gap-2.5">
          {PRESETS.map((p) => {
            const selected = selectedPreset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePreset(p)}
                aria-pressed={selected}
                className={cn(
                  'retro-btn relative flex-col gap-1 px-1 py-2.5 text-center',
                  selected ? 'bg-mustard text-ink' : 'bg-card text-ink',
                )}
              >
                {selected && (
                  <span aria-hidden="true" className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full border-2 border-ink bg-teal text-xs">
                    ✓
                  </span>
                )}
                <ChipStack count={p.chips} size={26} colorOffset={p.chips} />
                <span className="text-sm">{p.label}</span>
                <span className="font-sans text-[11px] font-semibold opacity-80">{p.desc}</span>
              </button>
            );
          })}
        </div>

        <form onSubmit={handleCreateRoom} className="space-y-5">
          {/* CR-4: collapsible custom setup */}
          <div>
            <button
              type="button"
              onClick={() => setIsCustomOpen(o => !o)}
              aria-expanded={isCustomOpen}
              className="mb-2 flex w-full items-center justify-between py-1 font-display text-sm uppercase tracking-wide text-ink-soft transition-colors hover:text-ink"
            >
              <span>Custom Setup</span>
              <ChevronDown
                aria-hidden="true"
                size={18}
                className={cn('transition-transform duration-200', isCustomOpen && 'rotate-180')}
              />
            </button>
            <div
              inert={!isCustomOpen}
              className={cn(
                'overflow-hidden transition-all duration-300',
                isCustomOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
              )}
            >
              <div className="space-y-4 px-1 pb-2">
                <StepperInput
                  id="startingStack"
                  label="Starting Stack"
                  value={startingStack}
                  onChange={(v) => { setStartingStack(v); setSelectedPreset(null); setIsCustomOpen(true); }}
                  min={100}
                  step={100}
                  error={stackError}
                />
                <div className="grid grid-cols-2 gap-3">
                  <StepperInput
                    id="smallBlind"
                    label="Small Blind"
                    value={smallBlind}
                    onChange={(v) => { setSmallBlind(v); setBigBlind(v * 2); setSelectedPreset(null); setIsCustomOpen(true); }}
                    min={1}
                    step={5}
                    error={sbError}
                  />
                  <StepperInput
                    id="bigBlind"
                    label="Big Blind"
                    value={bigBlind}
                    onChange={(v) => { setBigBlind(v); setSelectedPreset(null); setIsCustomOpen(true); }}
                    min={2}
                    step={5}
                  />
                </div>
              </div>
            </div>
          </div>

          {localError && (
            <div role="alert" className="animate-shake rounded-xl border-[3px] border-ink bg-tomato-deep px-4 py-3 text-sm font-semibold text-paper">
              {localError}
            </div>
          )}

          <RetroButton
            type="submit"
            tone="teal"
            size="xl"
            block
            disabled={loading || hasValidationError}
            className="uppercase"
          >
            {loading ? 'Creating...' : 'Create Game'}
          </RetroButton>
        </form>
      </div>

      <ol className="grid w-full max-w-md grid-cols-3 gap-2.5">
        {HOW_IT_WORKS.map(step => (
          <li key={step.n} className="flex flex-col items-center gap-1 rounded-xl border-[3px] border-ink bg-card px-2 py-2.5 text-center shadow-hard-sm">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-ink font-display text-sm text-paper">{step.n}</span>
            <span className="text-xs font-semibold leading-tight text-ink">{step.text}</span>
          </li>
        ))}
      </ol>

      <p className="text-center text-sm font-medium text-ink-soft">
        Have a room code?{' '}
        <Link to="/join" className="font-display text-royal underline decoration-2 underline-offset-2 hover:text-ink">
          Join a game
        </Link>
      </p>
    </div>
  );
}
```

### Step 2.3: Replace `src/frontend/src/pages/JoinRoomPage.tsx`

```tsx
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useGameStore } from '../stores/gameStore';
import type { GetRoomResponse, JoinRoomRequest, JoinRoomResponse } from '../types/game';
import ChipLogo from '../components/ChipLogo';
import Avatar from '../components/ui/Avatar';
import RetroButton from '../components/ui/RetroButton';
import { useApiWarmUp } from '../hooks/useApiWarmUp';
import { rememberPlayer } from '../lib/identity';
import { cn } from '@/lib/utils';

export default function JoinRoomPage() {
  useApiWarmUp();
  const [searchParams] = useSearchParams();
  const [roomCode, setRoomCode] = useState(searchParams.get('room') ?? '');
  const [error, setError] = useState('');
  const [roomInfo, setRoomInfo] = useState<GetRoomResponse['roomInfo'] | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState(false);
  const navigate = useNavigate();
  const { setRoomCode: storeRoomCode, setPlayerId: storePlayerId, setIsCreator } = useGameStore();

  const apiUrl = import.meta.env.VITE_API_URL ?? '';

  const handleLookupRoom = async (code?: string) => {
    const lookupCode = (code ?? roomCode).trim().toUpperCase();
    if (!lookupCode) { setError('Enter a room code'); return; }
    setLoading(true);
    setError('');
    setRoomInfo(null);
    try {
      const response = await fetch(`${apiUrl}/api/rooms/${lookupCode}`);
      if (!response.ok) { setError('Room not found. Check the code and try again.'); return; }
      const data: GetRoomResponse = await response.json();
      if (!data.success || !data.roomInfo) { setError('Room not found.'); return; }
      setRoomInfo(data.roomInfo);
    } catch {
      setError('Failed to reach game server.');
    } finally {
      setLoading(false);
    }
  };

  // Auto-lookup when navigated from QR code scan
  useEffect(() => {
    if (roomCode) handleLookupRoom(roomCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = roomCode.trim().toUpperCase();
    if (!code || !playerName.trim()) return;
    setJoining(true);
    setError('');
    try {
      const req: JoinRoomRequest = { name: playerName.trim() };
      const res = await fetch(`${apiUrl}/api/rooms/${code}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      const data: JoinRoomResponse = await res.json();
      if (data.success && data.playerId) {
        storeRoomCode(code);
        storePlayerId(data.playerId);
        setIsCreator(data.isCreator ?? false);
        rememberPlayer(code, data.playerId, data.isCreator ?? false);
        navigate(`/room/${code}/lobby`);
      } else {
        setError(data.error || 'Failed to join room');
      }
    } catch (err) {
      setError(`Failed to reach server: ${err}`);
    } finally {
      setJoining(false);
    }
  };

  const handleRejoin = (selectedPlayerId: string) => {
    const code = roomCode.trim().toUpperCase();
    const selectedIsCreator = roomInfo?.creatorPlayerId === selectedPlayerId;
    storeRoomCode(code);
    storePlayerId(selectedPlayerId);
    setIsCreator(selectedIsCreator);
    rememberPlayer(code, selectedPlayerId, selectedIsCreator);
    navigate(`/room/${code}`);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 px-4 py-8">
      <ChipLogo subtitle="Join Game" />

      <div className="retro-panel w-full max-w-md space-y-4 p-5">
        {/* JR-3: shrink code input when room is found */}
        <div className={cn('transition-all duration-300', roomInfo && 'scale-[0.98] opacity-80')}>
          <label htmlFor="room-code" className="mb-1.5 block font-display text-sm uppercase tracking-wide text-ink">
            Room Code
          </label>
          <div className="flex gap-2">
            <input
              id="room-code"
              type="text"
              value={roomCode}
              onChange={e => { setRoomCode(e.target.value.toUpperCase()); setRoomInfo(null); setError(''); }}
              placeholder="ABC123"
              maxLength={6}
              autoCapitalize="characters"
              autoComplete="off"
              className="retro-input min-w-0 flex-1 px-3 py-2.5 text-center font-display text-2xl uppercase tracking-[0.35em] placeholder:text-ink/25"
              onKeyDown={e => e.key === 'Enter' && handleLookupRoom()}
            />
            <RetroButton tone="royal" size="lg" onClick={() => handleLookupRoom()} disabled={loading}>
              {loading ? '...' : 'Look Up'}
            </RetroButton>
          </div>
        </div>

        {error && (
          <div role="alert" className="animate-shake rounded-xl border-[3px] border-ink bg-tomato-deep px-4 py-3 text-sm font-semibold text-paper">
            {error}
          </div>
        )}

        {roomInfo && !roomInfo.isGameStarted && (
          <form onSubmit={handleJoin} className="animate-slide-up space-y-3">
            <div>
              <label htmlFor="playerName" className="mb-1.5 block font-display text-sm uppercase tracking-wide text-ink">
                Your Name
              </label>
              <input
                id="playerName"
                type="text"
                value={playerName}
                onChange={e => setPlayerName(e.target.value)}
                placeholder="Enter your name"
                maxLength={20}
                autoFocus
                className="retro-input px-4 py-3 text-lg placeholder:text-ink/35"
              />
            </div>
            <RetroButton
              type="submit"
              tone="teal"
              size="xl"
              block
              disabled={joining || !playerName.trim()}
              className="uppercase"
            >
              {joining ? 'Joining...' : 'Join Game'}
            </RetroButton>
          </form>
        )}

        {roomInfo && roomInfo.isGameStarted && (
          <div className="animate-slide-up">
            <p className="mb-3 text-sm font-semibold text-ink-soft">Game in progress. Tap your name to rejoin:</p>
            <div className="space-y-2">
              {roomInfo.players.map((p, idx) => (
                <RetroButton
                  key={p.playerId}
                  block
                  size="lg"
                  onClick={() => handleRejoin(p.playerId)}
                  className="justify-start gap-3 text-left"
                >
                  <Avatar name={p.name} colorIndex={idx} size="md" />
                  {p.name}
                </RetroButton>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="text-center text-sm font-medium text-ink-soft">
        No code?{' '}
        <Link to="/" className="font-display text-royal underline decoration-2 underline-offset-2 hover:text-ink">
          Create a new game
        </Link>
      </p>
    </div>
  );
}
```

### Step 2.4: Replace `src/frontend/src/pages/LobbyPage.tsx`

The QR code must stay the only `role="img"` on this page (02, §2), so every icon is `aria-hidden`.

```tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, Share2, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGameStore } from '../stores/gameStore';
import { useRoomEvents } from '../hooks/useRoomEvents';
import * as api from '../lib/api';
import { moveSeat } from '../lib/seating';
import { recallPlayer, rememberPlayer } from '../lib/identity';
import { SeatMoveButtons } from '../components/SeatOrderDialog';
import { ChipLogoMark } from '../components/ChipLogo';
import Avatar from '../components/ui/Avatar';
import RetroButton from '../components/ui/RetroButton';

const MAX_PLAYERS = 9;

export default function LobbyPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const {
    playerId,
    isCreator,
    creatorPlayerId,
    lobbyPlayers,
    gameState,
    roomSettings,
    error,
    setRoomCode,
    setPlayerId,
    setIsCreator,
    addLobbyPlayer,
    applySnapshot,
    setError,
  } = useGameStore();
  // Pushed events and resyncs on every (re)connect keep the roster and settings current.
  useRoomEvents(roomCode, playerId);

  const [playerName, setPlayerName] = useState('');
  const [joining, setJoining] = useState(false);
  const [starting, setStarting] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reordering, setReordering] = useState(false);

  const joinUrl = roomCode ? `${window.location.origin}/join?room=${roomCode}` : '';
  const canShare = typeof (navigator as Navigator & { share?: unknown }).share === 'function';

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

  // Once the game starts (gameState becomes non-null), navigate to the game
  useEffect(() => {
    if (gameState && roomCode) {
      navigate(`/room/${roomCode}`);
    }
  }, [gameState, roomCode, navigate]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode || !playerName.trim()) return;
    setJoining(true);
    setJoinError(null);

    try {
      const data = await api.joinRoom(roomCode, playerName.trim());
      setPlayerId(data.playerId);
      setIsCreator(data.isCreator ?? false);
      applySnapshot(data);
      addLobbyPlayer({ playerId: data.playerId, name: playerName.trim() });
      rememberPlayer(roomCode, data.playerId, data.isCreator ?? false);
      setPlayerName('');
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : `Failed to reach server: ${err}`);
    } finally {
      setJoining(false);
    }
  };

  const handleStartGame = async () => {
    if (!roomCode || !playerId) return;
    setStarting(true);
    setError(null);

    try {
      applySnapshot(await api.startGame(roomCode, playerId));
      // Navigation happens once gameState is set (from this response or the pushed gameStarted event)
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to reach server: ${err}`);
    } finally {
      setStarting(false);
    }
  };

  const handleMoveSeat = async (index: number, delta: -1 | 1) => {
    if (!roomCode || !playerId || reordering) return;
    setReordering(true);
    setError(null);

    try {
      const order = moveSeat(lobbyPlayers.map(p => p.playerId), index, delta);
      applySnapshot(await api.reorderSeats(roomCode, playerId, order));
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to reach server: ${err}`);
    } finally {
      setReordering(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
      if (nav.share) {
        await nav.share({ title: 'Join my Deal Me In game', url: joinUrl });
      } else {
        await navigator.clipboard.writeText(joinUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // ignore
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const alreadyJoined = !!playerId;
  const canStart = isCreator && lobbyPlayers.length >= 2;
  const canReorder = !!playerId && playerId === creatorPlayerId && lobbyPlayers.length >= 2;

  return (
    <div className="flex min-h-[100dvh] flex-col items-center px-4 pb-36 pt-6">
      <div className="w-full max-w-md space-y-5">
        <div className="flex items-center justify-center gap-2">
          <ChipLogoMark size={40} />
          <span className="text-outline font-display text-3xl uppercase tracking-wide text-paper drop-shadow-[3px_3px_0_#1B1718]">
            Deal Me In
          </span>
        </div>

        {/* Room code + invite */}
        <section className="retro-panel p-5 text-center">
          <p className="mb-2 font-display text-sm uppercase tracking-[0.25em] text-ink-soft">Room Code</p>
          <button
            onClick={handleCopyCode}
            className="retro-btn mx-auto bg-mustard px-5 py-2 text-ink"
            aria-label="Copy room code"
            data-testid="room-code-hero"
          >
            <span className="font-display text-4xl tracking-[0.25em]">{roomCode}</span>
            {copied ? <Check aria-hidden="true" size={20} /> : <Copy aria-hidden="true" size={18} />}
          </button>

          {/* Game settings summary (LB-3) */}
          {roomSettings && (
            <div className="mt-3 flex justify-center gap-2 text-xs font-semibold">
              <span className="rounded-full border-2 border-ink bg-paper px-2.5 py-0.5 tabular-nums">
                Stack {roomSettings.startingStack.toLocaleString()}
              </span>
              <span className="rounded-full border-2 border-ink bg-paper px-2.5 py-0.5 tabular-nums">
                Blinds {roomSettings.smallBlind}/{roomSettings.bigBlind}
              </span>
            </div>
          )}

          {/* QR code: the only role="img" on this page (e2e TC01 uses getByRole('img')). */}
          <div className="mx-auto mt-5 w-fit -rotate-2 rounded-xl border-[3px] border-ink bg-white p-3 shadow-hard">
            <QRCodeSVG value={joinUrl} size={184} />
            <p className="mt-1 font-display text-xs uppercase tracking-widest text-ink">Scan to join</p>
          </div>

          <RetroButton tone="royal" size="md" className="mt-5" onClick={handleCopyLink}>
            <Share2 aria-hidden="true" size={16} />
            {canShare ? 'Share invite link' : (copied ? 'Copied!' : 'Copy invite link')}
          </RetroButton>
        </section>

        {/* Player list */}
        <section className="retro-panel p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-display text-lg uppercase tracking-wide text-ink">At the table</h2>
            <p className="text-sm font-semibold text-ink-soft">
              {lobbyPlayers.length} of {MAX_PLAYERS} players
            </p>
          </div>
          <div aria-hidden="true" className="mb-4 flex gap-1.5">
            {Array.from({ length: MAX_PLAYERS }, (_, i) => (
              <span
                key={i}
                className={cn('h-3 flex-1 rounded-full border-2 border-ink transition-colors duration-300', i < lobbyPlayers.length ? 'bg-teal' : 'bg-paper')}
              />
            ))}
          </div>

          {lobbyPlayers.length === 0 ? (
            <p className="py-4 text-center text-sm italic text-ink-soft">
              No players yet — be the first to join!
            </p>
          ) : (
            <>
              {canReorder && (
                <p className="mb-2 text-xs text-ink-soft" data-testid="seat-order-hint">
                  Arrange players in seating order, clockwise. The first player deals first.
                </p>
              )}
              <ul className="space-y-2">
                {lobbyPlayers.map((p, idx) => (
                  <li
                    key={p.playerId}
                    data-testid={`lobby-player-${idx}`}
                    className="animate-slide-in flex items-center gap-3 rounded-xl border-[3px] border-ink bg-paper px-2.5 py-2 shadow-hard-sm"
                  >
                    <Avatar name={p.name} colorIndex={idx} size="md" />
                    <div className="min-w-0">
                      <span className="block truncate font-display text-ink">{p.name}</span>
                      {idx === 0 && lobbyPlayers.length >= 2 && (
                        <p className="text-[11px] font-semibold leading-tight text-ink-soft">Deals first</p>
                      )}
                    </div>
                    <div className="ml-auto flex items-center gap-1.5">
                      {p.playerId === creatorPlayerId && (
                        <span className="inline-flex items-center gap-1 rounded-full border-2 border-ink bg-mustard px-1.5 font-display text-[10px] uppercase leading-4 text-ink">
                          <Crown aria-hidden="true" size={11} />
                          Host
                        </span>
                      )}
                      {p.playerId === playerId && (
                        <span className="rounded-full border-2 border-ink bg-bubblegum px-1.5 font-display text-[10px] uppercase leading-4 text-ink">
                          You
                        </span>
                      )}
                      {canReorder && (
                        <SeatMoveButtons
                          name={p.name}
                          index={idx}
                          count={lobbyPlayers.length}
                          disabled={reordering}
                          onMove={(delta) => handleMoveSeat(idx, delta)}
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* Join form */}
        {!alreadyJoined && (
          <form onSubmit={handleJoin} className="retro-panel space-y-3 p-5">
            <div>
              <label htmlFor="playerName" className="mb-1.5 block font-display text-sm uppercase tracking-wide text-ink">
                Your Name
              </label>
              <input
                id="playerName"
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name"
                maxLength={20}
                autoFocus
                className="retro-input px-4 py-3 text-lg placeholder:text-ink/35"
              />
            </div>
            {joinError && (
              <div role="alert" className="rounded-xl border-[3px] border-ink bg-tomato-deep px-3 py-2 text-sm font-semibold text-paper">
                {joinError}
              </div>
            )}
            <RetroButton
              type="submit"
              tone="teal"
              size="lg"
              block
              disabled={joining || !playerName.trim()}
              className="uppercase"
            >
              {joining ? 'Joining...' : 'Join Game'}
            </RetroButton>
          </form>
        )}

        {alreadyJoined && !isCreator && (
          <p className="animate-ellipsis text-center font-display text-base text-ink-soft">
            Waiting for the host to start the game
          </p>
        )}

        {error && (
          <div role="alert" className="rounded-xl border-[3px] border-ink bg-tomato-deep px-3 py-2 text-sm font-semibold text-paper">
            {error}
          </div>
        )}
      </div>

      {/* Sticky Start Game button */}
      {isCreator && (
        <div
          className="fixed inset-x-0 bottom-0 border-t-[3px] border-ink bg-paper-deep px-4 pt-3"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto max-w-md">
            {lobbyPlayers.length < 2 && (
              <p className="animate-ellipsis mb-2 text-center text-xs font-semibold text-ink-soft">
                Waiting for at least 1 more player
              </p>
            )}
            <RetroButton
              tone="mustard"
              size="xl"
              block
              onClick={handleStartGame}
              disabled={!canStart || starting}
              className="uppercase"
            >
              {starting ? 'Starting...' : 'Start Game'}
            </RetroButton>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Verify (from `src/frontend`)

```powershell
npx tsc -b
npm run lint
npm test
```

Expected: all exit 0, and `npm test` reports **68 passed**.
