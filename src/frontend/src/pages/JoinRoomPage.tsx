import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useGameStore } from '../stores/gameStore';
import type { GetRoomResponse, JoinRoomRequest, JoinRoomResponse } from '../types/game';
import { cn, getAvatarColor } from '@/lib/utils';
import ChipLogo from '../components/ChipLogo';

export default function JoinRoomPage() {
  const [searchParams] = useSearchParams();
  const [roomCode, setRoomCode] = useState(searchParams.get('room') ?? '');
  const [error, setError] = useState('');
  const [roomInfo, setRoomInfo] = useState<GetRoomResponse['roomInfo'] | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState(false);
  const navigate = useNavigate();
  const { setRoomCode: storeRoomCode, setPlayerId: storePlayerId, setIsCreator } = useGameStore();

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';

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
        sessionStorage.setItem(`playerId_${code}`, data.playerId);
        sessionStorage.setItem(`isCreator_${code}`, String(data.isCreator ?? false));
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
    storeRoomCode(code);
    storePlayerId(selectedPlayerId);
    sessionStorage.setItem(`playerId_${code}`, selectedPlayerId);
    navigate(`/room/${code}`);
  };

  return (
    <div className="min-h-[100dvh] bg-surface-bg flex items-center justify-center p-4">
      <div className="bg-surface-card rounded-2xl shadow-2xl p-8 w-full max-w-md border border-surface-elevated">
        <ChipLogo subtitle="Join Game" />

        <div className="space-y-4">
          {/* JR-3: shrink code input when room is found */}
          <div className={cn(
            'transition-all duration-300',
            roomInfo && 'opacity-70 -translate-y-1 scale-[0.98]'
          )}>
            <label htmlFor="room-code" className="block text-sm font-semibold text-text-secondary mb-2">Room Code</label>
            <div className="flex gap-2">
              <input
                id="room-code"
                type="text"
                value={roomCode}
                onChange={e => { setRoomCode(e.target.value.toUpperCase()); setRoomInfo(null); setError(''); }}
                placeholder="e.g., ABC123"
                maxLength={6}
                className="flex-1 px-4 py-3 rounded-xl bg-surface-elevated text-text-primary font-mono font-bold text-lg tracking-widest border border-surface-card focus:border-accent-primary focus:outline-none uppercase"
                onKeyDown={e => e.key === 'Enter' && handleLookupRoom()}
              />
              <button
                onClick={() => handleLookupRoom()}
                disabled={loading}
                className={cn(
                  'bg-accent-info text-white font-bold py-3 px-5 rounded-xl active:scale-95 transition-all',
                  loading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-accent-info/90'
                )}
              >
                {loading ? '...' : 'Look Up'}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-accent-danger/20 border border-accent-danger/50 text-accent-danger px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          {roomInfo && !roomInfo.isGameStarted && (
            <form onSubmit={handleJoin} className="space-y-3 animate-slide-up">
              <div>
                <label htmlFor="playerName" className="block text-sm font-semibold text-text-secondary mb-2">Your Name</label>
                <input
                  id="playerName"
                  type="text"
                  value={playerName}
                  onChange={e => setPlayerName(e.target.value)}
                  placeholder="Enter your name"
                  maxLength={20}
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl bg-surface-elevated text-text-primary border border-surface-card focus:border-accent-primary focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={joining || !playerName.trim()}
                className={cn(
                  'w-full bg-accent-primary text-white font-bold py-4 rounded-xl text-base active:scale-95 transition-all',
                  (joining || !playerName.trim()) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-accent-primary/90'
                )}
              >
                {joining ? 'Joining...' : 'Join Game'}
              </button>
            </form>
          )}

          {roomInfo && roomInfo.isGameStarted && (
            <div className="animate-slide-up">
              <p className="text-sm text-text-secondary mb-3">Game in progress — select your player to rejoin:</p>
              <div className="space-y-2">
                {roomInfo.players.map((p, idx) => (
                  <button
                    key={p.playerId}
                    onClick={() => handleRejoin(p.playerId)}
                    className="w-full bg-surface-elevated text-text-primary font-bold py-3 px-4 rounded-xl hover:bg-accent-primary/20 hover:border-accent-primary border-2 border-transparent active:scale-95 transition-all text-left flex items-center gap-3"
                  >
                    <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-base flex-shrink-0', getAvatarColor(idx))}>
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-text-secondary text-sm mt-6">
          No code?{' '}
          <Link to="/" className="text-accent-primary font-semibold hover:underline">
            Create a new game
          </Link>
        </p>
      </div>
    </div>
  );
}
