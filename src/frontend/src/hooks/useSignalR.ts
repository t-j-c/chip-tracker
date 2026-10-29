import { useEffect, useCallback, useRef } from 'react';
import * as signalR from '@microsoft/signalr';
import type { GameState, PotAward } from '../types/game';
import { PokerAction } from '../types/game';
import { useGameStore } from '../stores/gameStore';
import { infiniteRetryPolicy, reconnectDelayMs } from '../lib/reconnect';
import type { LobbyPlayer } from '../stores/gameStore';

export const useSignalR = (options?: { onRejoined?: () => void }) => {
  const connectionRef = useRef<signalR.HubConnection | null>(null);
  const rejoinRef = useRef<(isRestart: boolean) => Promise<void>>(async () => {});
  const targetRef = useRef<{ roomCode: string; playerId: string } | null>(null);
  const onRejoinedRef = useRef(options?.onRejoined);
  const { setGameState, setError, setUndoRequested, setUndoPendingSelf, clearUndoRequest, setUndoDeclined, setConnected, addLobbyPlayer } = useGameStore();

  useEffect(() => {
    onRejoinedRef.current = options?.onRejoined;
  });

  useEffect(() => {
    let disposed = false;
    let starting = false;
    let wake: (() => void) | null = null;

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${import.meta.env.VITE_API_URL ?? ''}/hubs/game`)
      .withAutomaticReconnect(infiniteRetryPolicy)
      .build();

    connectionRef.current = connection;

    // Joins the SignalR group for the current room; the server also resends the current state.
    const rejoin = async (isRestart: boolean) => {
      const target = targetRef.current;
      if (!target || disposed || connection.state !== signalR.HubConnectionState.Connected) return;
      try {
        await connection.invoke('JoinRoom', target.roomCode, target.playerId);
        if (isRestart) onRejoinedRef.current?.();
      } catch (err) {
        console.error('Error joining room:', err);
        setError('Failed to join room');
      }
    };
    rejoinRef.current = rejoin;

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });

    // Keeps trying (capped backoff) until connected; used for the first connect and after the
    // built-in reconnect policy closes the connection.
    const startWithRetry = async (isRestart: boolean) => {
      if (starting) return;
      starting = true;
      let attempt = 0;
      while (!disposed) {
        try {
          await connection.start();
          if (disposed) break;
          setConnected(true);
          await rejoin(isRestart);
          break;
        } catch (err) {
          if (disposed) break;
          console.error('SignalR connection error:', err);
          setConnected(false);
          await sleep(reconnectDelayMs(++attempt));
        }
      }
      starting = false;
      wake = null;
    };

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

    // A reconnect yields a new connection id that is not in the room group, so rejoin.
    connection.onreconnected(() => {
      setConnected(true);
      void rejoin(true);
    });

    connection.onreconnecting(() => {
      setConnected(false);
    });

    connection.onclose(() => {
      if (disposed) return;
      setConnected(false);
      void startWithRetry(true);
    });

    // After a phone sleeps, timers may have been frozen: reconnect now, or resync if still connected.
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || disposed) return;
      if (connection.state === signalR.HubConnectionState.Disconnected) {
        if (starting) wake?.();
        else void startWithRetry(true);
      } else if (connection.state === signalR.HubConnectionState.Connected) {
        void rejoin(true);
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    void startWithRetry(false);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisible);
      wake?.();
      void connection.stop();
    };
  }, [setGameState, setError, setUndoRequested, setUndoPendingSelf, clearUndoRequest, setUndoDeclined, setConnected, addLobbyPlayer]);

  // Remembers the room so it can be rejoined after any reconnect. If the connection is still
  // starting, the start path performs the join.
  const joinRoom = useCallback(async (roomCode: string, playerId: string) => {
    targetRef.current = { roomCode, playerId };
    await rejoinRef.current(false);
  }, []);

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
