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
    isConnected,
    undoRequested,
    undoDeclined,
    error,
    setRoomCode,
    setPlayerId,
    setUndoRequested,
    setUndoDeclined,
  } = useGameStore();
  const { joinRoom, submitAction, requestUndo, approveUndo, declineUndo, resolveShowdown, resolveSplitPot } = useSignalR();
  const [showUndoDialog, setShowUndoDialog] = useState(false);
  const [showShowdownDialog, setShowShowdownDialog] = useState(false);
  const [undoPending, setUndoPending] = useState(false);

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
    if (undoRequested && playerId && undoRequested !== playerId) {
      // Only show dialog to the player who RECEIVED the request (not the requester)
      setShowUndoDialog(true);
    }
  }, [undoRequested, playerId]);

  useEffect(() => {
    if (undoDeclined) {
      // Requester gets notified their undo was declined
      setUndoPending(false);
      const timer = setTimeout(() => setUndoDeclined(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [undoDeclined, setUndoDeclined]);

  useEffect(() => {
    if (gameState && gameState.phase === 'Showdown' && !gameState.isHandActive) {
      setShowShowdownDialog(true);
    } else if (gameState && gameState.isHandActive) {
      // New hand started — close showdown dialog
      setShowShowdownDialog(false);
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
      approveUndo(roomCode, playerId);
      setShowUndoDialog(false);
      setUndoRequested(null);
    }
  };

  const handleDeclineUndo = () => {
    if (playerId && roomCode && undoRequested) {
      declineUndo(roomCode, playerId);
    }
    setShowUndoDialog(false);
    setUndoRequested(null);
  };

  const handleSelectWinner = (winnerId: string) => {
    if (roomCode) {
      resolveShowdown(roomCode, winnerId);
      setShowShowdownDialog(false);
    }
  };

  const handleSplitPot = () => {
    if (roomCode) {
      resolveSplitPot(roomCode);
      setShowShowdownDialog(false);
    }
  };

  const handleRequestUndo = () => {
    if (playerId && roomCode) {
      requestUndo(roomCode, playerId);
      setUndoPending(true);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-800 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Chip Tracker</h1>
          <p className="text-green-100">Room: {roomCode}</p>
          {!isConnected && (
            <p className="text-yellow-300 text-sm mt-1 animate-pulse">Reconnecting...</p>
          )}
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

        {/* Undo Button + status */}
        <div className="text-center mb-4 space-y-2">
          <button
            onClick={handleRequestUndo}
            disabled={undoPending}
            className="bg-yellow-600 text-white font-bold py-2 px-4 rounded hover:bg-yellow-700 disabled:opacity-50"
          >
            {undoPending ? 'Undo Requested...' : 'Request Undo'}
          </button>
          {undoDeclined && (
            <p className="text-red-400 text-sm">Undo was declined by other player.</p>
          )}
        </div>
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

      {showShowdownDialog && (
        <ShowdownDialog
          gameState={gameState}
          onSelectWinner={handleSelectWinner}
          onSplitPot={handleSplitPot}
        />
      )}
    </div>
  );
}
