import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import type { CreateRoomRequest, CreateRoomResponse } from '../types/game';
import { useGameStore } from '../stores/gameStore';

export default function CreateRoomPage() {
  const navigate = useNavigate();
  const { setRoomCode, setPlayerId } = useGameStore();
  const [player1Name, setPlayer1Name] = useState('Player 1');
  const [player2Name, setPlayer2Name] = useState('Player 2');
  const [stack, setStack] = useState(1000);
  const [smallBlind, setSmallBlind] = useState(10);
  const [bigBlind, setBigBlind] = useState(20);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [createdRoomCode, setCreatedRoomCode] = useState<string | null>(null);
  const [createdPlayerId, setCreatedPlayerId] = useState<string | null>(null);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const request: CreateRoomRequest = {
        players: [
          { name: player1Name, stack },
          { name: player2Name, stack },
        ],
        smallBlind,
        bigBlind,
      };

      const res = await fetch(`${apiUrl}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      const data: CreateRoomResponse = await res.json();

      if (data.success && data.roomCode) {
        setCreatedRoomCode(data.roomCode);
        // player1Id is available from the updated backend; gracefully absent from old builds
        setCreatedPlayerId(data.player1Id ?? null);
      } else {
        setLocalError(data.error || 'Failed to create room');
      }
    } catch (err) {
      setLocalError(`Failed to reach server: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEnterGame = () => {
    if (!createdRoomCode) return;
    setRoomCode(createdRoomCode);
    if (createdPlayerId) {
      setPlayerId(createdPlayerId);
      sessionStorage.setItem(`playerId_${createdRoomCode}`, createdPlayerId);
    }
    navigate(`/room/${createdRoomCode}`);
  };

  // QR URL points to the join page with the room code pre-filled
  const joinUrl = createdRoomCode
    ? `${window.location.origin}/join?room=${createdRoomCode}`
    : '';

  if (createdRoomCode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-700 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md text-center">
          <h1 className="text-2xl font-bold text-green-900 mb-2">Room Created!</h1>
          <p className="text-gray-600 mb-1">Room Code:</p>
          <p className="text-4xl font-mono font-bold text-green-700 tracking-widest mb-6">{createdRoomCode}</p>

          <p className="text-sm text-gray-600 mb-3">
            Player 2: scan the QR code or go to <strong>/join</strong> and enter the room code.
          </p>
          <div className="flex justify-center mb-6">
            <QRCodeSVG value={joinUrl} size={200} />
          </div>

          <button
            onClick={handleEnterGame}
            className="w-full bg-green-600 text-white font-bold py-3 px-4 rounded-md hover:bg-green-700"
          >
            I'm Player 1 — Enter Game
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-6 text-green-900">Chip Tracker</h1>

        <form onSubmit={handleCreateRoom} className="space-y-4">
          <div>
            <label htmlFor="player1Name" className="block text-sm font-semibold text-gray-700">Player 1 Name</label>
            <input
              id="player1Name"
              type="text"
              value={player1Name}
              onChange={(e) => setPlayer1Name(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-600"
            />
          </div>

          <div>
            <label htmlFor="player2Name" className="block text-sm font-semibold text-gray-700">Player 2 Name</label>
            <input
              id="player2Name"
              type="text"
              value={player2Name}
              onChange={(e) => setPlayer2Name(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-600"
            />
          </div>

          <div>
            <label htmlFor="stack" className="block text-sm font-semibold text-gray-700">Starting Stack</label>
            <input
              id="stack"
              type="number"
              value={stack}
              onChange={(e) => setStack(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="smallBlind" className="block text-sm font-semibold text-gray-700">Small Blind</label>
              <input
                id="smallBlind"
                type="number"
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
