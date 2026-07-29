import { useEffect, useCallback, useRef } from 'react';
import * as signalR from '@microsoft/signalr';
import type { GameState, PotAward } from '../types/game';
import { PokerAction } from '../types/game';
import { useGameStore } from '../stores/gameStore';
import type { LobbyPlayer } from '../stores/gameStore';

export const useSignalR = () => {
  const connectionRef = useRef<signalR.HubConnection | null>(null);
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const { setGameState, setError, setUndoRequested, setUndoPendingSelf, clearUndoRequest, setUndoDeclined, setConnected, addLobbyPlayer } = useGameStore();

  useEffect(() => {
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${import.meta.env.VITE_API_URL ?? ''}/hubs/game`)
      .withAutomaticReconnect()
      .build();

    connectionRef.current = connection;

    // Register event handlers
    connection.on('GameStateUpdated', (state: GameState) => {
      setGameState(state);
      clearUndoRequest();
    });

    connection.on('UndoRequested', (requestingPlayerId: string) => {
      setUndoRequested(requestingPlayerId);
    });

    connection.on('UndoApproved', () => {
      clearUndoRequest();
    });

    connection.on('UndoDeclined', (decliningPlayerId: string) => {
      clearUndoRequest();
      setUndoDeclined(decliningPlayerId);
    });

    connection.on('UndoCancelled', () => {
      clearUndoRequest();
    });

    connection.on('Error', (message: string) => {
      setError(message);
    });

    connection.on('PlayerJoined', (player: LobbyPlayer) => {
      addLobbyPlayer(player);
    });

    connection.on('GameStarted', (state: GameState) => {
      setGameState(state);
    });

    connection.onreconnected(() => {
      setConnected(true);
    });

    connection.onreconnecting(() => {
      setConnected(false);
    });

    startPromiseRef.current = connection.start()
      .then(() => setConnected(true))
      .catch(err => {
        console.error('SignalR connection error:', err);
        setError('Failed to connect to game server');
      });

    return () => {
      connection.stop();
    };
  }, [setGameState, setError, setUndoRequested, setUndoPendingSelf, clearUndoRequest, setUndoDeclined, setConnected, addLobbyPlayer]);

  const joinRoom = useCallback(async (roomCode: string, playerId: string) => {
    if (!connectionRef.current) return;
    await startPromiseRef.current;
    connectionRef.current.invoke('JoinRoom', roomCode, playerId).catch(err => {
      console.error('Error joining room:', err);
      setError('Failed to join room');
    });
  }, [setError]);

  const submitAction = useCallback((roomCode: string, playerId: string, action: PokerAction, amount?: number) => {
    if (!connectionRef.current) return;
    connectionRef.current.invoke('SubmitAction', roomCode, playerId, action, amount).catch(err => {
      console.error('Error submitting action:', err);
      setError('Failed to submit action');
    });
  }, [setError]);

  /** Sends undo request to other player — does NOT modify state. */
  const requestUndo = useCallback((roomCode: string, playerId: string) => {
    if (!connectionRef.current) return;
    connectionRef.current.invoke('RequestUndo', roomCode, playerId).catch(err => {
      console.error('Error requesting undo:', err);
      setError('Failed to request undo');
    });
  }, [setError]);

  /** Approves undo — actually applies the state revert. Called by the receiving player. */
  const approveUndo = useCallback((roomCode: string, playerId: string) => {
    if (!connectionRef.current) return;
    connectionRef.current.invoke('ApproveUndo', roomCode, playerId).catch(err => {
      console.error('Error approving undo:', err);
      setError('Failed to approve undo');
    });
  }, [setError]);

  /** Declines undo — notifies requester. No state change. */
  const declineUndo = useCallback((roomCode: string, playerId: string) => {
    if (!connectionRef.current) return;
    connectionRef.current.invoke('DeclineUndo', roomCode, playerId).catch(err => {
      console.error('Error declining undo:', err);
    });
  }, []);

  /** Cancels an in-flight undo request. */
  const cancelUndo = useCallback((roomCode: string, playerId: string) => {
    if (!connectionRef.current) return;
    connectionRef.current.invoke('CancelUndo', roomCode, playerId).catch(err => {
      console.error('Error cancelling undo:', err);
    });
  }, []);

  /** Resolve showdown with a single winner. */
  const resolveShowdown = useCallback((roomCode: string, winnerPlayerId: string) => {
    if (!connectionRef.current) return;
    connectionRef.current.invoke('ResolveShowdown', roomCode, winnerPlayerId, false).catch(err => {
      console.error('Error resolving showdown:', err);
      setError('Failed to resolve showdown');
    });
  }, [setError]);

  /** Resolve showdown as a split pot. */
  const resolveSplitPot = useCallback((roomCode: string) => {
    if (!connectionRef.current) return;
    connectionRef.current.invoke('ResolveShowdown', roomCode, '', true).catch(err => {
      console.error('Error splitting pot:', err);
      setError('Failed to split pot');
    });
  }, [setError]);

  /** Resolve showdown with one winner-list per pot (used when the hand has side pots). */
  const resolveShowdownWithAwards = useCallback((roomCode: string, awards: PotAward[]) => {
    if (!connectionRef.current) return;
    connectionRef.current.invoke('ResolveShowdownWithAwards', roomCode, awards).catch(err => {
      console.error('Error resolving showdown with awards:', err);
      setError('Failed to resolve showdown');
    });
  }, [setError]);

  /** Buys a busted (or previously eliminated) player back in for the room's starting stack. */
  const rebuy = useCallback((roomCode: string, playerId: string) => {
    if (!connectionRef.current) return;
    connectionRef.current.invoke('Rebuy', roomCode, playerId).catch(err => {
      console.error('Error rebuying:', err);
      setError('Failed to rebuy');
    });
  }, [setError]);

  /** Cashes a busted player out instead of rebuying. */
  const declineRebuy = useCallback((roomCode: string, playerId: string) => {
    if (!connectionRef.current) return;
    connectionRef.current.invoke('DeclineRebuy', roomCode, playerId).catch(err => {
      console.error('Error declining rebuy:', err);
      setError('Failed to cash out');
    });
  }, [setError]);

  return {
    joinRoom,
    submitAction,
    requestUndo,
    approveUndo,
    declineUndo,
    cancelUndo,
    resolveShowdown,
    resolveSplitPot,
    resolveShowdownWithAwards,
    rebuy,
    declineRebuy,
  };
};
