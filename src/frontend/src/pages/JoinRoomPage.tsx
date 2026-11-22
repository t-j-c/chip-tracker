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
