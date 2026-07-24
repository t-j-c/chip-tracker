import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useSignalR } from '../hooks/useSignalR';
import { PokerAction } from '../types/game';
import PlayerPanel from '../components/PlayerPanel';
import PotDisplay from '../components/PotDisplay';
import ActionBar from '../components/ActionBar';
import UndoDialog from '../components/UndoDialog';
import ShowdownDialog from '../components/ShowdownDialog';

export default function GamePage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const {
    playerId,
    gameState,
    undoRequested,
    error,
    setRoomCode,
    setPlayerId,
    setUndoRequested,
  } = useGameStore();
  const { joinRoom, submitAction, requestUndo, resolveShowdown } = useSignalR();
  const [showUndoDialog, setShowUndoDialog] = useState(false);
  const [showShowdownDialog, setShowShowdownDialog] = useState(false);

  useEffect(() => {
    if (!roomCode) return;

    if (!playerId) {
      // Get stored playerId from session or ask player to select
      const storedPlayerId = sessionStorage.getItem(`playerId_${roomCode}`);
      if (storedPlayerId) {
        setPlayerId(storedPlayerId);
        joinRoom(roomCode, storedPlayerId);
      }
    } else {
      setRoomCode(roomCode);
      joinRoom(roomCode, playerId);
    }
  }, [roomCode, playerId, setRoomCode, setPlayerId, joinRoom]);

  useEffect(() => {
    if (undoRequested && playerId) {
      setShowUndoDialog(true);
    }
  }, [undoRequested, playerId]);

  useEffect(() => {
    if (gameState && gameState.phase === 'Showdown' && !gameState.isHandActive) {
      setShowShowdownDialog(true);
    }
  }, [gameState]);

  if (!gameState) {
    return (
      <div className="min-h-screen bg-green-900 flex items-center justify-center text-white">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Chip Tracker</h1>
          <p className="text-xl">Connecting to game...</p>
          {error && <p className="text-red-400 mt-4">{error}</p>}
        </div>
      </div>
    );
  }

  const isYourTurn = playerId && gameState.activePlayerTurnId === playerId;
  const currentPlayer = gameState.players.find(p => p.playerId === playerId);
  const otherPlayer = gameState.players.find(p => p.playerId !== playerId);

  const handleAction = (action: PokerAction, amount?: number) => {
    if (playerId && roomCode) {
      submitAction(roomCode, playerId, action, amount);
    }
  };

  const handleApproveUndo = () => {
    if (playerId && roomCode) {
      requestUndo(roomCode, playerId);
      setShowUndoDialog(false);
      setUndoRequested(null);
    }
  };

  const handleDeclineUndo = () => {
    setShowUndoDialog(false);
    setUndoRequested(null);
  };

  const handleSelectWinner = (winnerId: string) => {
    if (roomCode) {
      resolveShowdown(roomCode, winnerId);
      setShowShowdownDialog(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-800 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Chip Tracker</h1>
          <p className="text-green-100">Room: {roomCode}</p>
        </div>

        {/* Game Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* Player 1 */}
          <div className="flex justify-center">
            {otherPlayer && <PlayerPanel player={otherPlayer} isActivePlayer={gameState.activePlayerTurnId === otherPlayer.playerId} />}
          </div>

          {/* Center Pot */}
          <div className="flex justify-center">
            <PotDisplay state={gameState} />
          </div>

          {/* Player 2 (You) */}
          <div className="flex justify-center">
            {currentPlayer && <PlayerPanel player={currentPlayer} isActivePlayer={!!isYourTurn} />}
          </div>
        </div>

        {/* Action Bar */}
        <div className="mb-4">
          <ActionBar gameState={gameState} playerId={playerId} onAction={handleAction} isYourTurn={!!isYourTurn} />
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-200 border border-red-600 text-red-800 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* Undo Button */}
        {isYourTurn && (
          <div className="text-center mb-4">
            <button
              onClick={() => {
                if (playerId && roomCode) {
                  requestUndo(roomCode, playerId);
                }
              }}
              className="bg-yellow-600 text-white font-bold py-2 px-4 rounded hover:bg-yellow-700"
            >
              Request Undo
            </button>
          </div>
        )}
      </div>

      {/* Dialogs */}
      {showUndoDialog && undoRequested && otherPlayer && (
        <UndoDialog
          requestingPlayerName={
            gameState.players.find(p => p.playerId === undoRequested)?.name || 'Other player'
          }
          onApprove={handleApproveUndo}
          onDecline={handleDeclineUndo}
        />
      )}

      {showShowdownDialog && <ShowdownDialog gameState={gameState} onSelectWinner={handleSelectWinner} />}
    </div>
  );
}
