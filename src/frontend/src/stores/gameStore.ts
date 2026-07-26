import { create } from 'zustand';
import type { GameState } from '../types/game';

export interface LobbyPlayer {
  playerId: string;
  name: string;
}

export interface RoomSettings {
  startingStack: number;
  smallBlind: number;
  bigBlind: number;
}

export interface GameStore {
  roomCode: string | null;
  playerId: string | null;
  isCreator: boolean;
  lobbyPlayers: LobbyPlayer[];
  gameState: GameState | null;
  roomSettings: RoomSettings | null;
  isConnected: boolean;
  error: string | null;
  undoRequested: string | null;
  /** Set when this player's undo request was declined by the other player. */
  undoDeclined: string | null;
  setRoomCode: (code: string) => void;
  setPlayerId: (id: string) => void;
  setIsCreator: (isCreator: boolean) => void;
  setLobbyPlayers: (players: LobbyPlayer[]) => void;
  addLobbyPlayer: (player: LobbyPlayer) => void;
  setGameState: (state: GameState) => void;
  setRoomSettings: (settings: RoomSettings | null) => void;
  setConnected: (connected: boolean) => void;
  setError: (error: string | null) => void;
  setUndoRequested: (playerId: string | null) => void;
  setUndoDeclined: (playerId: string | null) => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  roomCode: null,
  playerId: null,
  isCreator: false,
  lobbyPlayers: [],
  gameState: null,
  roomSettings: null,
  isConnected: false,
  error: null,
  undoRequested: null,
  undoDeclined: null,
  setRoomCode: (code) => set({ roomCode: code }),
  setPlayerId: (id) => set({ playerId: id }),
  setIsCreator: (isCreator) => set({ isCreator }),
  setLobbyPlayers: (players) => set({ lobbyPlayers: players }),
  addLobbyPlayer: (player) => set((state) => ({
    lobbyPlayers: state.lobbyPlayers.some(p => p.playerId === player.playerId)
      ? state.lobbyPlayers
      : [...state.lobbyPlayers, player],
  })),
  setGameState: (state) => set({ gameState: state }),
  setRoomSettings: (settings) => set({ roomSettings: settings }),
  setConnected: (connected) => set({ isConnected: connected }),
  setError: (error) => set({ error }),
  setUndoRequested: (playerId) => set({ undoRequested: playerId }),
  setUndoDeclined: (playerId) => set({ undoDeclined: playerId }),
  reset: () => set({
    roomCode: null,
    playerId: null,
    isCreator: false,
    lobbyPlayers: [],
    gameState: null,
    roomSettings: null,
    error: null,
    undoRequested: null,
    undoDeclined: null,
  }),
}));
