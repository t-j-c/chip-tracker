import { useParams } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useRoomEvents } from '../hooks/useRoomEvents';
import { useGameCommands } from '../hooks/useGameCommands';
import { useWakeLock } from '../hooks/useWakeLock';
import { useTableEvents } from '../hooks/useTableEvents';
import { useTurnTitle } from '../hooks/useTurnTitle';
import { PokerAction } from '../types/game';
import type { PotAward } from '../types/game';
import PokerTable from '../components/table/PokerTable';
import HeroPanel from '../components/table/HeroPanel';
import ActionBar from '../components/ActionBar';
import GameHeader from '../components/GameHeader';
import UndoDialog from '../components/UndoDialog';
import ShowdownDialog from '../components/ShowdownDialog';
import RebuyDialog from '../components/RebuyDialog';
import SeatOrderDialog from '../components/SeatOrderDialog';
import RestartHandDialog from '../components/RestartHandDialog';
import StandingsDialog from '../components/StandingsDialog';
import { ActivityStrip } from '../components/ActivityStrip';
import { ActivityHistoryModal } from '../components/ActivityHistoryModal';
import { ChipLogoMark } from '../components/ChipLogo';
import Avatar from '../components/ui/Avatar';
import RetroButton from '../components/ui/RetroButton';
import { recallPlayer, rememberPlayer } from '../lib/identity';
import { opponentsInSeatOrder } from '../lib/seating';
import { playSound } from '../lib/sound';
import { HAPTICS, vibrate } from '../lib/haptics';
import { formatMoney } from '@/lib/utils';

const NOTICE = 'mx-3 mb-2 rounded-xl border-[3px] border-ink bg-card px-3 py-2 text-center text-sm font-semibold text-ink shadow-hard-sm';

export default function GamePage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const {
    playerId, creatorPlayerId, gameState, isConnected, undoDeclined, roomSettings, error,
    setRoomCode, setPlayerId, setIsCreator, setUndoDeclined,
  } = useGameStore();
  useRoomEvents(roomCode, playerId);
  const {
    submitAction, requestUndo, approveUndo, declineUndo, cancelUndo, resolveShowdown,
    resolveSplitPot, resolveShowdownWithAwards, rebuy, declineRebuy, reorderSeats, restartHand,
  } = useGameCommands();

  const undoRequested = gameState?.pendingUndoRequestBy ?? null;
  const undoPendingSelf = !!playerId && undoRequested === playerId;
  const isAdmin = !!playerId && playerId === creatorPlayerId;
  const [showUndoDialog, setShowUndoDialog] = useState(false);
  const [showShowdownDialog, setShowShowdownDialog] = useState(false);
  const [showActivityHistory, setShowActivityHistory] = useState(false);
  const [showSeatOrderDialog, setShowSeatOrderDialog] = useState(false);
  const [showRestartHandDialog, setShowRestartHandDialog] = useState(false);
  const [showStandings, setShowStandings] = useState(false);
  const [errorKey, setErrorKey] = useState(0);
  const [celebratingWinnerId, setCelebratingWinnerId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const prevActiveRef = useRef<string | null>(null);
  const prevPhaseRef = useRef<string | null>(null);
  const recentActivity = useMemo(() => gameState?.recentActivity ?? [], [gameState?.recentActivity]);

  const announce = useCallback((message: string) => setAnnouncement(message), []);
  const { bubbles, wins, splash } = useTableEvents(gameState, playerId, announce);
  const isYourTurn = !!playerId && !!gameState && gameState.activePlayerTurnId === playerId;
  useTurnTitle(isYourTurn);
  useWakeLock();

  useEffect(() => {
    if (!roomCode) return;
    setRoomCode(roomCode);
    if (!playerId) {
      const remembered = recallPlayer(roomCode);
      if (remembered) {
        setPlayerId(remembered.playerId);
        setIsCreator(remembered.isCreator);
      }
    }
  }, [roomCode, playerId, setRoomCode, setPlayerId, setIsCreator]);

  useEffect(() => {
    if (undoRequested && playerId && undoRequested !== playerId) setShowUndoDialog(true);
    else setShowUndoDialog(false);
  }, [undoRequested, playerId]);

  useEffect(() => {
    if (!undoDeclined) return;
    const timer = setTimeout(() => setUndoDeclined(null), 3000);
    return () => clearTimeout(timer);
  }, [undoDeclined, setUndoDeclined]);

  useEffect(() => {
    if (!error) return;
    setErrorKey(k => k + 1);
    playSound('error');
    vibrate(HAPTICS.error);
  }, [error]);

  useEffect(() => {
    if (!gameState) return;
    const { activePlayerTurnId, phase, players } = gameState;
    if (phase !== prevPhaseRef.current && prevPhaseRef.current !== null) {
      setAnnouncement(`Phase: ${phase}`);
    } else if (activePlayerTurnId && activePlayerTurnId !== prevActiveRef.current) {
      const active = players.find(p => p.playerId === activePlayerTurnId);
      if (active) setAnnouncement(active.playerId === playerId ? 'Your turn' : `${active.name}'s turn`);
    }
    prevActiveRef.current = activePlayerTurnId ?? null;
    prevPhaseRef.current = phase;
  }, [gameState, playerId]);

  useEffect(() => {
    if (!announcement) return;
    const t = setTimeout(() => setAnnouncement(''), 3000);
    return () => clearTimeout(t);
  }, [announcement]);

  useEffect(() => {
    if (gameState && gameState.phase === 'Showdown' && !gameState.isHandActive) setShowShowdownDialog(true);
    else if (gameState && gameState.phase !== 'Showdown') setShowShowdownDialog(false);
  }, [gameState]);

  if (!gameState) {
    return (
      <div className="flex h-[100dvh] items-center justify-center px-4">
        <div className="retro-panel flex flex-col items-center gap-3 px-8 py-6 text-center">
          <ChipLogoMark size={64} className="animate-spin-slow" />
          <h1 className="font-display text-3xl uppercase tracking-wide text-ink">Deal Me In</h1>
          <p className="animate-pulse font-display text-ink-soft">Connecting to game...</p>
          {error && <p className="text-sm font-semibold text-tomato-deep">{error}</p>}
        </div>
      </div>
    );
  }

  const currentPlayer = gameState.players.find(p => p.playerId === playerId);
  const heroSeatIndex = gameState.players.findIndex(p => p.playerId === playerId);
  const otherPlayers = opponentsInSeatOrder(gameState.players, playerId);
  const seatedPlayers = gameState.players.filter(p => !p.isEliminated);
  const othersAwaitingRebuy = otherPlayers.filter(p => p.isAwaitingRebuy);
  const showRebuyDialog = !!currentPlayer?.isAwaitingRebuy;
  const waitingForPlayers = !gameState.isHandActive && !showRebuyDialog && othersAwaitingRebuy.length === 0 && seatedPlayers.length < 2;
  const seatOrderPending = !!gameState.pendingSeatOrder?.length;
  const canRestartHand = gameState.isHandActive || gameState.phase === 'Showdown'
    || (seatedPlayers.length >= 2 && !seatedPlayers.some(p => p.isAwaitingRebuy));

  const handleAction = (action: PokerAction, amount?: number) => {
    if (playerId && roomCode) submitAction(roomCode, playerId, action, amount);
  };
  const handlePickPlayer = (pickedPlayerId: string) => {
    if (!roomCode) return;
    const pickedIsCreator = pickedPlayerId === creatorPlayerId;
    rememberPlayer(roomCode, pickedPlayerId, pickedIsCreator);
    setPlayerId(pickedPlayerId);
    setIsCreator(pickedIsCreator);
  };
  const handleSaveSeatOrder = (orderedPlayerIds: string[]) => {
    if (playerId && roomCode) reorderSeats(roomCode, playerId, orderedPlayerIds);
    setShowSeatOrderDialog(false);
  };
  const handleConfirmRestartHand = () => {
    if (playerId && roomCode) restartHand(roomCode, playerId);
    setShowRestartHandDialog(false);
  };
  const handleApproveUndo = () => {
    if (playerId && roomCode) approveUndo(roomCode, playerId);
    setShowUndoDialog(false);
  };
  const handleDeclineUndo = () => {
    if (playerId && roomCode && undoRequested) declineUndo(roomCode, playerId);
    setShowUndoDialog(false);
  };
  const handleCancelUndo = () => {
    if (playerId && roomCode) cancelUndo(roomCode, playerId);
  };
  const handleSelectWinner = (winnerId: string) => {
    if (!roomCode) return;
    setCelebratingWinnerId(winnerId);
    setTimeout(() => {
      resolveShowdown(roomCode, winnerId);
      setShowShowdownDialog(false);
      setCelebratingWinnerId(null);
    }, 1500);
  };
  const handleSplitPot = () => {
    if (roomCode) resolveSplitPot(roomCode);
    setShowShowdownDialog(false);
  };
  const handleResolveAwards = (awards: PotAward[]) => {
    if (roomCode) resolveShowdownWithAwards(roomCode, awards);
    setShowShowdownDialog(false);
  };
  const handleRequestUndo = () => {
    if (playerId && roomCode) requestUndo(roomCode, playerId);
  };
  const handleRebuy = () => {
    if (playerId && roomCode) rebuy(roomCode, playerId);
  };
  const handleCashOut = () => {
    if (playerId && roomCode) declineRebuy(roomCode, playerId);
  };

  return (
    <div className="flex flex-col" style={{ height: '100dvh', overflow: 'hidden' }} data-testid="game-page">
      <GameHeader
        roomCode={roomCode ?? ''} isConnected={isConnected} undoPending={undoPendingSelf}
        onRequestUndo={handleRequestUndo}
        onOpenStandings={() => setShowStandings(true)}
        onOpenActivity={() => setShowActivityHistory(true)}
        onOpenSeatOrder={isAdmin ? () => setShowSeatOrderDialog(true) : undefined}
        onRestartHand={isAdmin && canRestartHand ? () => setShowRestartHandDialog(true) : undefined}
      />
      {undoPendingSelf && (
        <div data-testid="undo-pending" className="animate-slide-down flex shrink-0 items-center justify-between gap-3 border-b-[3px] border-ink bg-bubblegum px-4 py-2">
          <span className="animate-ellipsis text-sm font-semibold text-ink">Undo requested. Waiting for approval</span>
          <RetroButton size="sm" onClick={handleCancelUndo} data-testid="undo-cancel" className="min-h-8 shrink-0 px-2 text-xs">Cancel</RetroButton>
        </div>
      )}
      <div aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</div>
      <ActivityStrip entries={recentActivity} onOpenHistory={() => setShowActivityHistory(true)} />

      <main className="flex min-h-0 flex-1 flex-col landscape-short:flex-row">
        <section className="relative min-h-0 flex-1 px-1 pb-2 pt-6 landscape-short:pt-4">
          <PokerTable gameState={gameState} playerId={playerId} bubbles={bubbles} wins={wins} splash={splash} />
        </section>
        <section className="mx-auto w-full max-w-2xl shrink-0 landscape-short:mx-0 landscape-short:flex landscape-short:w-[340px] landscape-short:max-w-none landscape-short:flex-col landscape-short:justify-end landscape-short:overflow-y-auto landscape-short:border-l-[3px] landscape-short:border-ink">
          {!playerId && (
            <div data-testid="pick-player" className={NOTICE}>
              <p className="mb-2 text-ink-soft">You're watching. Tap your name to take your seat:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {gameState.players.map((p, idx) => (
                  <RetroButton key={p.playerId} size="sm" onClick={() => handlePickPlayer(p.playerId)} className="gap-1.5 pl-1.5">
                    <Avatar name={p.name} colorIndex={idx} size="sm" />{p.name}
                  </RetroButton>
                ))}
              </div>
            </div>
          )}
          {seatOrderPending && <div data-testid="seat-order-pending" className={NOTICE}>New seating order starts next hand</div>}
          {othersAwaitingRebuy.length > 0 && <div data-testid="waiting-for-rebuy" className={`${NOTICE} animate-pulse`}>Waiting for {othersAwaitingRebuy.map(p => p.name).join(', ')} to buy back in...</div>}
          {waitingForPlayers && <div data-testid="waiting-for-players" className={NOTICE}>Waiting for more players to join or buy back in...</div>}
          {currentPlayer?.isEliminated && (
            <div className="mx-3 mb-2">
              <RetroButton data-testid="buy-back-in-button" tone="teal" size="lg" block onClick={handleRebuy}>
                {roomSettings ? `Buy Back In for ${formatMoney(roomSettings.startingStack)}` : 'Buy Back In'}
              </RetroButton>
            </div>
          )}
          {error && <div key={errorKey} role="alert" className="animate-shake mx-3 mb-2 rounded-xl border-[3px] border-ink bg-tomato-deep px-4 py-2 text-sm font-semibold text-paper">{error}</div>}
          {undoDeclined && <div className={`${NOTICE} text-tomato-deep`}>Undo was declined by other player.</div>}
          {currentPlayer && (
            <HeroPanel player={currentPlayer} colorIndex={heroSeatIndex} isActive={isYourTurn} bubble={playerId ? bubbles[playerId] : undefined} win={playerId ? wins[playerId] : undefined} />
          )}
          <ActionBar gameState={gameState} playerId={playerId} onAction={handleAction} isYourTurn={isYourTurn} />
        </section>
      </main>

      {showUndoDialog && undoRequested && (
        <UndoDialog requestingPlayerName={gameState.players.find(p => p.playerId === undoRequested)?.name || 'Other player'} onApprove={handleApproveUndo} onDecline={handleDeclineUndo} />
      )}
      {showShowdownDialog && (
        <ShowdownDialog gameState={gameState} onSelectWinner={handleSelectWinner} onSplitPot={handleSplitPot} onResolveAwards={handleResolveAwards} celebratingWinnerId={celebratingWinnerId} />
      )}
      {showRebuyDialog && roomSettings && <RebuyDialog startingStack={roomSettings.startingStack} onRebuy={handleRebuy} onCashOut={handleCashOut} />}
      {showSeatOrderDialog && isAdmin && <SeatOrderDialog players={gameState.players} pendingOrder={gameState.pendingSeatOrder} onSave={handleSaveSeatOrder} onClose={() => setShowSeatOrderDialog(false)} />}
      {showRestartHandDialog && isAdmin && <RestartHandDialog onConfirm={handleConfirmRestartHand} onCancel={() => setShowRestartHandDialog(false)} />}
      {showStandings && <StandingsDialog players={gameState.players} onClose={() => setShowStandings(false)} />}
      <ActivityHistoryModal open={showActivityHistory} onOpenChange={setShowActivityHistory} roomCode={roomCode ?? ''} fallbackEntries={recentActivity} />
    </div>
  );
}
