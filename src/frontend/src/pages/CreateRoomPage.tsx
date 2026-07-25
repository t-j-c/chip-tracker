import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CreateRoomRequest, CreateRoomResponse } from '../types/game';

export default function CreateRoomPage() {
  const navigate = useNavigate();
  const [startingStack, setStartingStack] = useState(1000);
  const [smallBlind, setSmallBlind] = useState(10);
  const [bigBlind, setBigBlind] = useState(20);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
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
    <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-2 text-green-900">Chip Tracker</h1>
        <p className="text-center text-gray-500 mb-6 text-sm">2–9 players · Share via QR or link after creating</p>

        <form onSubmit={handleCreateRoom} className="space-y-4">
          <div>
            <label htmlFor="startingStack" className="block text-sm font-semibold text-gray-700">Starting Stack</label>
            <input
              id="startingStack"
              type="number"
              min={1}
              value={startingStack}
              onChange={(e) => setStartingStack(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="smallBlind" className="block text-sm font-semibold text-gray-700">Small Blind</label>
              <input
                id="smallBlind"
                type="number"
                min={1}
                value={smallBlind}
                onChange={(e) => setSmallBlind(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-600"
              />
            </div>
            <div>
              <label htmlFor="bigBlind" className="block text-sm font-semibold text-gray-700">Big Blind</label>
              <input
                id="bigBlind"
                type="number"
                min={1}
                value={bigBlind}
                onChange={(e) => setBigBlind(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-600"
              />
            </div>
          </div>

          {localError && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {localError}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 text-white font-bold py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-400"
          >
            {loading ? 'Creating...' : 'Create Game'}
          </button>
        </form>
      </div>
    </div>
  );
}
