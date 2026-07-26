import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, Share2, Crown } from 'lucide-react';
import { cn, getAvatarColor } from '@/lib/utils';
import { useGameStore } from '../stores/gameStore';
import { useSignalR } from '../hooks/useSignalR';
import type { JoinRoomRequest, JoinRoomResponse, GetRoomResponse } from '../types/game';

export default function LobbyPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const {
    playerId,
    isCreator,
    lobbyPlayers,
    gameState,
    roomSettings,
    setRoomCode,
    setPlayerId,
    setIsCreator,
    setLobbyPlayers,
    addLobbyPlayer,
    setRoomSettings,
    setError,
  } = useGameStore();
  const { joinRoom } = useSignalR();

  const [playerName, setPlayerName] = useState('');
  const [joining, setJoining] = useState(false);
  const [starting, setStarting] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [creatorPlayerId, setCreatorPlayerId] = useState<string | null>(null);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
  const joinUrl = roomCode ? `${window.location.origin}/join?room=${roomCode}` : '';

  // Load room state on mount (to populate lobby players if navigating back)
  const loadRoom = useCallback(async () => {
    if (!roomCode) return;
    try {
      const res = await fetch(`${apiUrl}/api/rooms/${roomCode}`);
      const data: GetRoomResponse = await res.json();
      if (data.success && data.roomInfo) {
        setLobbyPlayers(data.roomInfo.players.map(p => ({ playerId: p.playerId, name: p.name })));
        setRoomSettings({
          startingStack: data.roomInfo.startingStack,
          smallBlind: data.roomInfo.smallBlind,
          bigBlind: data.roomInfo.bigBlind,
        });
        setCreatorPlayerId(data.roomInfo.creatorPlayerId ?? null);
        // If the game already started, redirect to game page
        if (data.roomInfo.isGameStarted) {
          navigate(`/room/${roomCode}`);
        }
      }
    } catch {
      // Non-fatal: lobby will still work via SignalR
    }
  }, [roomCode, apiUrl, setLobbyPlayers, setRoomSettings, navigate]);

  useEffect(() => {
    if (roomCode) {
      setRoomCode(roomCode);
      loadRoom();
    }
  }, [roomCode, setRoomCode, loadRoom]);

  // When playerId is set, join the SignalR group so we get PlayerJoined events
  useEffect(() => {
    if (roomCode && playerId) {
      joinRoom(roomCode, playerId);
    }
  }, [roomCode, playerId, joinRoom]);

  // If GameStarted event arrives (via SignalR → gameState set in store), navigate to game
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
      const req: JoinRoomRequest = { name: playerName.trim() };
      const res = await fetch(`${apiUrl}/api/rooms/${roomCode}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      const data: JoinRoomResponse = await res.json();

      if (data.success && data.playerId) {
        setPlayerId(data.playerId);
        setIsCreator(data.isCreator ?? false);
        addLobbyPlayer({ playerId: data.playerId, name: playerName.trim() });
        sessionStorage.setItem(`playerId_${roomCode}`, data.playerId);
        sessionStorage.setItem(`isCreator_${roomCode}`, String(data.isCreator ?? false));
        setPlayerName('');
      } else {
        setJoinError(data.error || 'Failed to join room');
      }
    } catch (err) {
      setJoinError(`Failed to reach server: ${err}`);
    } finally {
      setJoining(false);
    }
  };

  const handleStartGame = async () => {
    if (!roomCode || !playerId) return;
    setStarting(true);
    setError(null);

    try {
      const res = await fetch(`${apiUrl}/api/rooms/${roomCode}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Failed to start game');
      }
      // Navigation happens via the GameStarted SignalR event → gameState set → useEffect above
    } catch (err) {
      setError(`Failed to reach server: ${err}`);
    } finally {
      setStarting(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
      if (nav.share) {
        await nav.share({ title: 'Join my Chip Tracker game', url: joinUrl });
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

  return (
    <div className="min-h-[100dvh] bg-surface-bg flex flex-col items-center justify-start p-4 pb-28 overflow-y-auto">
      <div className="bg-surface-card rounded-2xl shadow-2xl p-6 w-full max-w-md border border-surface-elevated mt-4">

        {/* Room code hero */}
        <div className="text-center mb-3">
          <p className="text-xs text-text-secondary uppercase tracking-widest mb-2 font-semibold">Room Code</p>
          <button
            onClick={handleCopyCode}
            className="flex items-center justify-center gap-2 mx-auto px-4 py-2 rounded-xl hover:bg-surface-elevated transition-colors group"
            aria-label="Copy room code"
            data-testid="room-code-hero"
          >
            <span className="font-mono text-3xl font-bold text-text-primary tracking-[0.25em] group-hover:text-accent-primary transition-colors">
              {roomCode}
            </span>
            {copied ? (
              <Check size={18} className="text-accent-primary" />
            ) : (
              <Copy size={16} className="text-text-secondary" />
            )}
          </button>
        </div>

        {/* Game settings summary (LB-3) */}
        {roomSettings && (
          <p className="text-center text-xs text-text-secondary mb-5 font-mono">
            Stack: {roomSettings.startingStack.toLocaleString()} · Blinds: {roomSettings.smallBlind}/{roomSettings.bigBlind}
          </p>
        )}

        {/* QR code */}
        <div className="flex flex-col items-center gap-3 mb-5">
          <div className="p-3 rounded-xl bg-white">
            <QRCodeSVG value={joinUrl} size={200} />
          </div>
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-2 text-sm text-text-secondary hover:text-accent-primary transition-colors"
          >
            <Share2 size={15} />
            {(navigator as Navigator & { share?: unknown }).share ? 'Share invite link' : (copied ? 'Copied!' : 'Copy invite link')}
          </button>
        </div>

        {/* Player list */}
        <div className="mb-5">
          <div className="mb-3">
            <p className="text-sm font-semibold text-text-secondary mb-1.5">
              {lobbyPlayers.length} of 9 players
            </p>
            <div className="h-2 bg-surface-elevated rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-primary rounded-full transition-all duration-300"
                style={{ width: `${Math.round((lobbyPlayers.length / 9) * 100)}%` }}
              />
            </div>
          </div>
          {lobbyPlayers.length === 0 ? (
            <p className="text-text-secondary text-sm italic text-center py-4">
              No players yet — be the first to join!
            </p>
          ) : (
            <ul className="space-y-2">
              {lobbyPlayers.map((p, idx) => (
                <li
                  key={p.playerId}
                  className="animate-slide-in flex items-center gap-3 px-3 py-3 bg-surface-elevated rounded-xl"
                >
                  <div className={cn('w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-base flex-shrink-0', getAvatarColor(idx))}>
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-medium text-text-primary">{p.name}</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    {p.playerId === creatorPlayerId && (
                      <Crown size={13} className="text-accent-warning" aria-label="Host" />
                    )}
                    {p.playerId === playerId && (
                      <span className="text-xs text-accent-primary font-semibold">(you)</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Join form */}
        {!alreadyJoined && (
          <form onSubmit={handleJoin} className="mb-4 space-y-3">
            <div>
              <label htmlFor="playerName" className="block text-sm font-semibold text-text-secondary mb-2">
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
                className="w-full px-4 py-3 rounded-xl bg-surface-elevated text-text-primary border border-surface-card focus:border-accent-primary focus:outline-none"
              />
            </div>
            {joinError && (
              <div className="bg-accent-danger/20 border border-accent-danger/50 text-accent-danger px-3 py-2 rounded-xl text-sm">
                {joinError}
              </div>
            )}
            <button
              type="submit"
              disabled={joining || !playerName.trim()}
              className={cn(
                'w-full bg-accent-primary text-white font-bold py-3 rounded-xl active:scale-95 transition-all',
                (joining || !playerName.trim()) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-accent-primary/90'
              )}
            >
              {joining ? 'Joining...' : 'Join Game'}
            </button>
          </form>
        )}

        {alreadyJoined && !isCreator && (
          <p className="text-center text-text-secondary text-sm animate-ellipsis">
            Waiting for the host to start the game
          </p>
        )}
      </div>

      {/* Sticky Start Game button */}
      {isCreator && (
        <div
          className="fixed bottom-0 left-0 right-0 px-4 pb-safe bg-surface-bg/90 backdrop-blur-sm border-t border-surface-elevated"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          {lobbyPlayers.length < 2 && (
            <p className="text-center text-text-secondary text-xs mb-2 animate-ellipsis">
              Waiting for at least 1 more player
            </p>
          )}
          <button
            onClick={handleStartGame}
            disabled={!canStart || starting}
            className={cn(
              'w-full font-bold py-4 rounded-xl text-base active:scale-95 transition-all max-w-md mx-auto block',
              canStart && !starting
                ? 'bg-accent-warning text-text-on-light hover:bg-accent-warning/90'
                : 'bg-surface-elevated text-text-secondary cursor-not-allowed'
            )}
          >
            {starting ? 'Starting...' : 'Start Game'}
          </button>
        </div>
      )}
    </div>
  );}