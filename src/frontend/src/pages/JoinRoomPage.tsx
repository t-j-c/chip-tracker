import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useGameStore } from '../stores/gameStore';
import type { GetRoomResponse, JoinRoomRequest, JoinRoomResponse } from '../types/game';

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
    <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold mb-6 text-gray-800 text-center">Join Game</h1>

        <div className="space-y-4">
          <div>
            <label htmlFor="room-code" className="block text-sm font-semibold text-gray-700 mb-2">Room Code</label>
            <div className="flex gap-2">
              <input
                id="room-code"
                type="text"
                value={roomCode}
                onChange={e => { setRoomCode(e.target.value.toUpperCase()); setRoomInfo(null); setError(''); }}
                placeholder="e.g., ABC123"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                onKeyDown={e => e.key === 'Enter' && handleLookupRoom()}
              />
              <button
                onClick={() => handleLookupRoom()}
                disabled={loading}
                className="bg-blue-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                {loading ? '...' : 'Look Up'}
              </button>
            </div>
          </div>

          {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">{error}</div>}

          {roomInfo && !roomInfo.isGameStarted && (
            <form onSubmit={handleJoin} className="space-y-3">
              <div>
                <label htmlFor="playerName" className="block text-sm font-semibold text-gray-700 mb-1">Your Name</label>
                <input
                  id="playerName"
                  type="text"
                  value={playerName}
                  onChange={e => setPlayerName(e.target.value)}
                  placeholder="Enter your name"
                  maxLength={20}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-600"
                />
              </div>
              <button
                type="submit"
                disabled={joining || !playerName.trim()}
                className="w-full bg-green-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-green-600 disabled:opacity-50"
              >
                {joining ? 'Joining...' : 'Join Game'}
              </button>
            </form>
          )}

          {roomInfo && roomInfo.isGameStarted && (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Game in progress — select your player to rejoin:</p>
              <div className="space-y-2">
                {roomInfo.players.map(p => (
                  <button
                    key={p.playerId}
                    onClick={() => handleRejoin(p.playerId)}
                    className="w-full bg-green-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-green-600 text-left"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 text-center">
          <p className="text-gray-600 mb-2">Don't have a room code?</p>
          <a href="/" className="text-blue-500 font-semibold hover:text-blue-600">
            Create a new game
          </a>
        </div>
      </div>
    </div>
  );
}
