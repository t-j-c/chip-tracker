import { useEffect, useCallback, useRef } from 'react';
import * as signalR from '@microsoft/signalr';
import type { GameState } from '../types/game';
import { PokerAction } from '../types/game';
import { useGameStore } from '../stores/gameStore';

export const useSignalR = () => {
  const connectionRef = useRef<signalR.HubConnection | null>(null);
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const { setGameState, setError, setUndoRequested, setConnected } = useGameStore();

  useEffect(() => {
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/hubs/game`)
      .withAutomaticReconnect()
      .build();

    connectionRef.current = connection;

    // Register event handlers
    connection.on('GameStateUpdated', (state: GameState) => {
      setGameState(state);
    });

    connection.on('UndoRequested', (requestingPlayerId: string) => {
      setUndoRequested(requestingPlayerId);
    });

    connection.on('Error', (message: string) => {
      setError(message);
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
  }, [setGameState, setError, setUndoRequested, setConnected]);

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

  const requestUndo = useCallback((roomCode: string, playerId: string) => {
    if (!connectionRef.current) return;
    connectionRef.current.invoke('RequestUndo', roomCode, playerId).catch(err => {
      console.error('Error requesting undo:', err);
      setError('Failed to request undo');
    });
  }, [setError]);

  const resolveShowdown = useCallback((roomCode: string, winnerPlayerId: string) => {
    if (!connectionRef.current) return;
    connectionRef.current.invoke('ResolveShowdown', roomCode, winnerPlayerId).catch(err => {
      console.error('Error resolving showdown:', err);
      setError('Failed to resolve showdown');
    });
  }, [setError]);

  return {
    joinRoom,
    submitAction,
    requestUndo,
    resolveShowdown,
  };
};
