import { useParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { useGameStore } from '../stores/gameStore';
import { useSignalR } from '../hooks/useSignalR';
import { useWakeLock } from '../hooks/useWakeLock';
import { PokerAction } from '../types/game';
import PlayerPanel from '../components/PlayerPanel';
import PotDisplay from '../components/PotDisplay';
import PhaseStepper from '../components/PhaseStepper';
import ActionBar from '../components/ActionBar';
import GameHeader from '../components/GameHeader';
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
    setIsCreator,
    setUndoRequested,
    setUndoDeclined,
  } = useGameStore();
  const { joinRoom, submitAction, requestUndo, approveUndo, declineUndo, resolveShowdown, resolveSplitPot } = useSignalR();
  const [showUndoDialog, setShowUndoDialog] = useState(false);
  const [showShowdownDialog, setShowShowdownDialog] = useState(false);
  const [undoPending, setUndoPending] = useState(false);
  // AN-8: error shake key — increment to replay animation on each new error
  const [errorKey, setErrorKey] = useState(0);
  // SD-5: confetti celebration state
  const [celebratingWinnerId, setCelebratingWinnerId] = useState<string | null>(null);
  // A11Y-6: screen reader announcements
  const [announcement, setAnnouncement] = useState('');
  const prevActiveRef = useRef<string | null>(null);
  const prevPhaseRef = useRef<string | null>(null);
  // MB-5: keep screen awake during active game
  useWakeLock();

  useEffect(() => {
    if (!roomCode) return;

    if (!playerId) {
      const storedPlayerId = sessionStorage.getItem(`playerId_${roomCode}`);
      const storedIsCreator = sessionStorage.getItem(`isCreator_${roomCode}`) === 'true';
      if (storedPlayerId) {
        setPlayerId(storedPlayerId);
        setIsCreator(storedIsCreator);
        joinRoom(roomCode, storedPlayerId);
      }
    } else {
      setRoomCode(roomCode);
      joinRoom(roomCode, playerId);
    }
  }, [roomCode, playerId, setRoomCode, setPlayerId, setIsCreator, joinRoom]);

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

  // AN-8: increment error key to replay shake animation on each new error
  useEffect(() => {
    if (error) setErrorKey(k => k + 1);
  }, [error]);

  // A11Y-6: announce turn changes and phase changes to screen readers
  useEffect(() => {
    if (!gameState) return;
    const { activePlayerTurnId, phase, players } = gameState;

    if (phase !== prevPhaseRef.current && prevPhaseRef.current !== null) {
      setAnnouncement(`Phase: ${phase}`);
    } else if (activePlayerTurnId && activePlayerTurnId !== prevActiveRef.current) {
      const active = players.find(p => p.playerId === activePlayerTurnId);
      if (active) setAnnouncement(`${active.name}'s turn`);
    }

    prevActiveRef.current = activePlayerTurnId ?? null;
    prevPhaseRef.current = phase;
  }, [gameState]);

  useEffect(() => {
    if (!announcement) return;
    const t = setTimeout(() => setAnnouncement(''), 3000);
    return () => clearTimeout(t);
  }, [announcement]);

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
      <div className="flex items-center justify-center h-[100dvh] bg-surface-bg">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-text-primary mb-4">Chip Tracker</h1>
          <p className="text-text-secondary">Connecting to game...</p>
          {error && <p className="text-accent-danger mt-4 text-sm">{error}</p>}
        </div>
      </div>
    );
  }

  const isYourTurn = playerId && gameState.activePlayerTurnId === playerId;
  const currentPlayer = gameState.players.find(p => p.playerId === playerId);
  const otherPlayers = gameState.players.filter(p => p.playerId !== playerId);

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
      // SD-5: fire confetti + celebrate for 1.5s before closing
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
      setCelebratingWinnerId(winnerId);
      setTimeout(() => {
        resolveShowdown(roomCode, winnerId);
        setShowShowdownDialog(false);
        setCelebratingWinnerId(null);
      }, 1500);
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
    <div className="flex flex-col bg-surface-bg" style={{ height: '100dvh', overflow: 'hidden' }} data-testid="game-page">
      {/* Minimal header — undoPending no longer shown inside header (GP-27) */}
      <GameHeader
        roomCode={roomCode ?? ''}
        isConnected={isConnected}
        undoPending={false}
        onRequestUndo={handleRequestUndo}
      />

      {/* GP-27: Undo request sent — top toast banner */}
      {undoPending && (
        <div data-testid="undo-pending" className="animate-slide-down bg-accent-warning/20 border-b border-accent-warning/40 px-4 py-2 flex items-center justify-between gap-3">
          <span className="text-sm text-accent-warning font-semibold animate-ellipsis">Undo requested. Waiting for approval</span>
          <button
            onClick={() => setUndoPending(false)}
            className="text-xs text-accent-warning font-bold hover:underline flex-shrink-0"
          >
            Cancel
          </button>
        </div>
      )}

      {/* A11Y-6: sr-only live region for screen reader announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</div>

      {/* Scrollable main content — game-main enables landscape layout via CSS */}
      <main className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 px-4 py-3 game-main">
        {/* Opponent strip — horizontal scroll; game-opponents switches to vertical in landscape */}
        {otherPlayers.length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 game-opponents" style={{ scrollbarWidth: 'none' }}>
            {otherPlayers.map(p => (
              <PlayerPanel
                key={p.playerId}
                player={p}
                isActivePlayer={gameState.activePlayerTurnId === p.playerId}
                variant="opponent"
              />
            ))}
          </div>
        )}

        {/* Center column: pot, phase, notifications — game-center in landscape */}
        <div className="flex flex-col gap-3 game-center">
          {/* Pot display */}
          <PotDisplay state={gameState} />

          {/* Phase stepper */}
          <PhaseStepper phase={gameState.phase as import('../types/game').GamePhase} />

          {/* AN-8: error banner with shake animation */}
          {error && (
            <div
              key={errorKey}
              className="animate-shake bg-accent-danger/20 border border-accent-danger/50 text-accent-danger px-4 py-3 rounded-xl text-sm"
            >
              {error}
            </div>
          )}

          {/* Undo declined notification */}
          {undoDeclined && (
            <div className="text-center text-accent-danger text-sm">
              Undo was declined by other player.
            </div>
          )}
        </div>

        {/* Your player info — game-self in landscape */}
        {currentPlayer && (
          <div className="game-self">
            <PlayerPanel
              player={currentPlayer}
              isActivePlayer={!!isYourTurn}
              variant="self"
            />
          </div>
        )}
      </main>

      {/* Action bar — bottom */}
      <ActionBar
        gameState={gameState}
        playerId={playerId}
        onAction={handleAction}
        isYourTurn={!!isYourTurn}
      />

      {/* Dialogs */}
      {showUndoDialog && undoRequested && (
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
          celebratingWinnerId={celebratingWinnerId}
        />
      )}
    </div>
  );
}
