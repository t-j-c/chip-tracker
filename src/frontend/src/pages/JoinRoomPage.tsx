import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../stores/gameStore';

export default function JoinRoomPage() {
  const [roomCode, setRoomCode] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { setRoomCode: storeRoomCode, setPlayerId: storePlayerId } = useGameStore();

  const handleJoin = async () => {
    if (!roomCode.trim() || !playerId.trim()) {
      setError('Please enter both room code and player ID');
      return;
    }

    try {
      // Try to fetch room to verify it exists
      const response = await fetch(`http://localhost:5000/api/rooms/${roomCode}`);
      if (!response.ok) {
        setError('Room not found. Check the room code and try again.');
        return;
      }

      storeRoomCode(roomCode.toUpperCase());
      storePlayerId(playerId);
      sessionStorage.setItem(`playerId_${roomCode}`, playerId);
      navigate(`/room/${roomCode.toUpperCase()}`);
    } catch (err) {
      setError('Failed to join room. Please check the room code.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold mb-6 text-gray-800 text-center">Rejoin Game</h1>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Room Code</label>
            <input
              type="text"
              value={roomCode}
              onChange={e => setRoomCode(e.target.value.toUpperCase())}
              placeholder="e.g., ABC123"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              onKeyPress={e => e.key === 'Enter' && handleJoin()}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Your Player ID</label>
            <input
              type="text"
              value={playerId}
              onChange={e => setPlayerId(e.target.value)}
              placeholder="Your unique player ID"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              onKeyPress={e => e.key === 'Enter' && handleJoin()}
            />
          </div>

          {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">{error}</div>}

          <button
            onClick={handleJoin}
            className="w-full bg-blue-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-600"
          >
            Join Game
          </button>
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
