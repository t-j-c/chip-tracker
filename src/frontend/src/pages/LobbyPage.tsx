import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
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
    setRoomCode,
    setPlayerId,
    setIsCreator,
    setLobbyPlayers,
    addLobbyPlayer,
    setError,
  } = useGameStore();
  const { joinRoom } = useSignalR();

  const [playerName, setPlayerName] = useState('');
  const [joining, setJoining] = useState(false);
  const [starting, setStarting] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
        // If the game already started, redirect to game page
        if (data.roomInfo.isGameStarted) {
          navigate(`/room/${roomCode}`);
        }
      }
    } catch {
      // Non-fatal: lobby will still work via SignalR
    }
  }, [roomCode, apiUrl, setLobbyPlayers, navigate]);

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
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the text
    }
  };

  const alreadyJoined = !!playerId;
  const canStart = isCreator && lobbyPlayers.length >= 2;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-green-900 text-center mb-1">Game Lobby</h1>
        <p className="text-center text-gray-500 text-sm mb-6">Room Code:</p>
        <p className="text-4xl font-mono font-bold text-green-700 tracking-widest text-center mb-6">
          {roomCode}
        </p>

        {/* Invite section */}
        <div className="mb-6">
          <p className="text-sm font-semibold text-gray-700 mb-2 text-center">Invite others to join</p>
          <div className="flex justify-center mb-3">
            <QRCodeSVG value={joinUrl} size={160} />
          </div>
          <div className="flex gap-2">
            <input
              readOnly
              value={joinUrl}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-xs text-gray-600 bg-gray-50 truncate"
            />
            <button
              onClick={handleCopyLink}
              className="bg-blue-500 text-white font-semibold px-3 py-2 rounded-md hover:bg-blue-600 text-sm whitespace-nowrap"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Player list */}
        <div className="mb-6">
          <p className="text-sm font-semibold text-gray-700 mb-2">
            Players ({lobbyPlayers.length}/9)
          </p>
          {lobbyPlayers.length === 0 ? (
            <p className="text-gray-400 text-sm italic">No players yet — be the first to join!</p>
          ) : (
            <ul className="space-y-1">
              {lobbyPlayers.map((p) => (
                <li key={p.playerId} className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-md">
                  <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                  <span className="font-medium text-gray-800">{p.name}</span>
                  {p.playerId === playerId && (
                    <span className="ml-auto text-xs text-green-600 font-semibold">(you)</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Join form — only shown if not yet joined */}
        {!alreadyJoined && (
          <form onSubmit={handleJoin} className="mb-4 space-y-3">
            <div>
              <label htmlFor="playerName" className="block text-sm font-semibold text-gray-700 mb-1">
                Your Name
              </label>
              <input
                id="playerName"
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name"
                maxLength={20}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-600"
              />
            </div>
            {joinError && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded text-sm">
                {joinError}
              </div>
            )}
            <button
              type="submit"
              disabled={joining || !playerName.trim()}
              className="w-full bg-green-600 text-white font-bold py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-400"
            >
              {joining ? 'Joining...' : 'Join Game'}
            </button>
          </form>
        )}

        {/* Start game — only for creator, only when ≥2 players joined */}
        {isCreator && (
          <div>
            {lobbyPlayers.length < 2 && (
              <p className="text-center text-gray-400 text-sm mb-2">
                Waiting for at least 1 more player…
              </p>
            )}
            <button
              onClick={handleStartGame}
              disabled={!canStart || starting}
              className="w-full bg-yellow-500 text-white font-bold py-3 px-4 rounded-md hover:bg-yellow-600 disabled:bg-gray-300 disabled:text-gray-500"
            >
              {starting ? 'Starting...' : 'Start Game'}
            </button>
          </div>
        )}

        {alreadyJoined && !isCreator && (
          <p className="text-center text-gray-500 text-sm animate-pulse">
            Waiting for the host to start the game…
          </p>
        )}
      </div>
    </div>
  );
}
