import { create } from 'zustand';
import type { GameState } from '../types/game';

export interface GameStore {
  roomCode: string | null;
  playerId: string | null;
  gameState: GameState | null;
  isConnected: boolean;
  error: string | null;
  undoRequested: string | null;
  setRoomCode: (code: string) => void;
  setPlayerId: (id: string) => void;
  setGameState: (state: GameState) => void;
  setConnected: (connected: boolean) => void;
  setError: (error: string | null) => void;
  setUndoRequested: (playerId: string | null) => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  roomCode: null,
  playerId: null,
  gameState: null,
  isConnected: false,
  error: null,
  undoRequested: null,
  setRoomCode: (code) => set({ roomCode: code }),
  setPlayerId: (id) => set({ playerId: id }),
  setGameState: (state) => set({ gameState: state }),
  setConnected: (connected) => set({ isConnected: connected }),
  setError: (error) => set({ error }),
  setUndoRequested: (playerId) => set({ undoRequested: playerId }),
  reset: () => set({
    roomCode: null,
    playerId: null,
    gameState: null,
    error: null,
    undoRequested: null,
  }),
}));
