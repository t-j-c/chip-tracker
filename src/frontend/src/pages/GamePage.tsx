import { useParams } from 'react-router-dom';
import { useEffect, useRef, useState, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { useGameStore } from '../stores/gameStore';
import { useSignalR } from '../hooks/useSignalR';
import { useWakeLock } from '../hooks/useWakeLock';
import { PokerAction } from '../types/game';
import type { PotAward, GetRoomResponse } from '../types/game';
import PlayerPanel from '../components/PlayerPanel';
import PotDisplay from '../components/PotDisplay';
import PhaseStepper from '../components/PhaseStepper';
import ActionBar from '../components/ActionBar';
import GameHeader from '../components/GameHeader';
import UndoDialog from '../components/UndoDialog';
import ShowdownDialog from '../components/ShowdownDialog';
import RebuyDialog from '../components/RebuyDialog';

export default function GamePage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const {
    playerId,
    gameState,
    isConnected,
    undoRequested,
    undoDeclined,
    roomSettings,
    error,
    setRoomCode,
    setPlayerId,
    setIsCreator,
    setUndoRequested,
    setUndoDeclined,
    setRoomSettings,
  } = useGameStore();
  const { joinRoom, submitAction, requestUndo, approveUndo, declineUndo, resolveShowdown, resolveSplitPot, resolveShowdownWithAwards, rebuy, declineRebuy } = useSignalR();
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

  // Fetch room settings (starting stack) if not already known, e.g. after a direct page
  // refresh into /room/:code that skipped the lobby flow — needed to show the rebuy amount.
  const fetchRoomSettings = useCallback(async () => {
    if (!roomCode || roomSettings) return;
    try {
      const apiUrl = import.meta.env.VITE_API_URL ?? '';
      const res = await fetch(`${apiUrl}/api/rooms/${roomCode}`);
      const data: GetRoomResponse = await res.json();
      if (data.success && data.roomInfo) {
        setRoomSettings({
          startingStack: data.roomInfo.startingStack,
          smallBlind: data.roomInfo.smallBlind,
          bigBlind: data.roomInfo.bigBlind,
        });
      }
    } catch {
      // Non-fatal: rebuy dialog falls back to a generic label without the amount.
    }
  }, [roomCode, roomSettings, setRoomSettings]);

  useEffect(() => {
    fetchRoomSettings();
  }, [fetchRoomSettings]);

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
    // Open only when the hand actually ended at Showdown awaiting a winner selection.
    // (!isHandActive alone is not enough — it's also true while waiting on a busted
    // player's rebuy decision, which has its own dialog and no pots left to resolve.)
    if (gameState && gameState.phase === 'Showdown' && !gameState.isHandActive) {
      setShowShowdownDialog(true);
    } else if (gameState && gameState.phase !== 'Showdown') {
      // Showdown was resolved (new hand started, or blocked awaiting a rebuy decision that
      // resets Phase back to PreFlop) — close the showdown dialog either way.
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
  const seatedPlayers = gameState.players.filter(p => !p.isEliminated);
  const othersAwaitingRebuy = otherPlayers.filter(p => p.isAwaitingRebuy);
  const showRebuyDialog = !!currentPlayer?.isAwaitingRebuy;
  const waitingForPlayers = !gameState.isHandActive && !showRebuyDialog && othersAwaitingRebuy.length === 0 && seatedPlayers.length < 2;

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

  const handleResolveAwards = (awards: PotAward[]) => {
    if (roomCode) {
      resolveShowdownWithAwards(roomCode, awards);
      setShowShowdownDialog(false);
    }
  };

  const handleRequestUndo = () => {
    if (playerId && roomCode) {
      requestUndo(roomCode, playerId);
      setUndoPending(true);
    }
  };

  const handleRebuy = () => {
    if (playerId && roomCode) {
      rebuy(roomCode, playerId);
    }
  };

  const handleCashOut = () => {
    if (playerId && roomCode) {
      declineRebuy(roomCode, playerId);
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

          {/* Waiting on another player's rebuy decision */}
          {othersAwaitingRebuy.length > 0 && (
            <div
              data-testid="waiting-for-rebuy"
              className="text-center text-text-secondary text-sm bg-surface-card rounded-xl px-4 py-3 animate-pulse"
            >
              Waiting for {othersAwaitingRebuy.map(p => p.name).join(', ')} to buy back in...
            </div>
          )}

          {/* Not enough seated players to continue */}
          {waitingForPlayers && (
            <div
              data-testid="waiting-for-players"
              className="text-center text-text-secondary text-sm bg-surface-card rounded-xl px-4 py-3"
            >
              Waiting for more players to join or buy back in...
            </div>
          )}

          {/* Eliminated player — persistent option to buy back in */}
          {currentPlayer?.isEliminated && (
            <button
              data-testid="buy-back-in-button"
              onClick={handleRebuy}
              className="bg-accent-primary text-white font-bold py-3 px-4 rounded-xl transition-all hover:opacity-90 active:scale-95"
            >
              {roomSettings ? `Buy Back In for $${roomSettings.startingStack.toLocaleString()}` : 'Buy Back In'}
            </button>
          )}

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
          onResolveAwards={handleResolveAwards}
          celebratingWinnerId={celebratingWinnerId}
        />
      )}

      {showRebuyDialog && roomSettings && (
        <RebuyDialog
          startingStack={roomSettings.startingStack}
          onRebuy={handleRebuy}
          onCashOut={handleCashOut}
        />
      )}
    </div>
  );
}
