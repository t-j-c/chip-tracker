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

          <div className="mx-auto mt-5 w-fit -rotate-2 rounded-xl border-[3px] border-ink bg-white p-3 shadow-hard">
            <QRCodeSVG value={joinUrl} size={184} />
            <p className="mt-1 font-display text-xs uppercase tracking-widest text-ink">Scan to join</p>
          </div>

          <RetroButton tone="royal" size="md" className="mt-5" onClick={handleCopyLink}>
            <Share2 aria-hidden="true" size={16} />
            {canShare ? 'Share invite link' : (copied ? 'Copied!' : 'Copy invite link')}
          </RetroButton>
        </section>

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
