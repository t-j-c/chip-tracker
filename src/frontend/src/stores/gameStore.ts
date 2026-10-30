import { create } from 'zustand';
import type { GameState, RoomSnapshot } from '../types/game';

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
  creatorPlayerId: string | null;
  lobbyPlayers: LobbyPlayer[];
  gameState: GameState | null;
  roomSettings: RoomSettings | null;
  /** Highest room revision applied so far; older snapshots are ignored. */
  lastRevision: number;
  isConnected: boolean;
  error: string | null;
  /** Set when this player's undo request was declined by the other player. */
  undoDeclined: string | null;
  setRoomCode: (code: string) => void;
  setPlayerId: (id: string) => void;
  setIsCreator: (isCreator: boolean) => void;
  setLobbyPlayers: (players: LobbyPlayer[]) => void;
  addLobbyPlayer: (player: LobbyPlayer) => void;
  setRoomSettings: (settings: RoomSettings | null) => void;
  /** Applies a snapshot only if it is newer than the last one applied. Returns whether it was applied. */
  applySnapshot: (snapshot: RoomSnapshot) => boolean;
  setConnected: (connected: boolean) => void;
  setError: (error: string | null) => void;
  setUndoDeclined: (playerId: string | null) => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  roomCode: null,
  playerId: null,
  isCreator: false,
  creatorPlayerId: null,
  lobbyPlayers: [],
  gameState: null,
  roomSettings: null,
  lastRevision: 0,
  isConnected: false,
  error: null,
  undoDeclined: null,
  setRoomCode: (code) =>
    set((state) => (state.roomCode === code ? {} : { roomCode: code, lastRevision: 0 })),
  setPlayerId: (id) => set({ playerId: id }),
  setIsCreator: (isCreator) => set({ isCreator }),
  setLobbyPlayers: (players) => set({ lobbyPlayers: players }),
  addLobbyPlayer: (player) => set((state) => ({
    lobbyPlayers: state.lobbyPlayers.some(p => p.playerId === player.playerId)
      ? state.lobbyPlayers
      : [...state.lobbyPlayers, player],
  })),
  setRoomSettings: (settings) => set({ roomSettings: settings }),
  applySnapshot: ({ revision, roomInfo, gameState }) => {
    if (revision <= get().lastRevision) return false;
    set((state) => ({
      lastRevision: revision,
      gameState: gameState ?? state.gameState,
      lobbyPlayers: roomInfo
        ? roomInfo.players.map(p => ({ playerId: p.playerId, name: p.name }))
        : state.lobbyPlayers,
      roomSettings: roomInfo
        ? { startingStack: roomInfo.startingStack, smallBlind: roomInfo.smallBlind, bigBlind: roomInfo.bigBlind }
        : state.roomSettings,
      creatorPlayerId: roomInfo ? roomInfo.creatorPlayerId ?? null : state.creatorPlayerId,
    }));
    return true;
  },
  setConnected: (connected) => set({ isConnected: connected }),
  setError: (error) => set({ error }),
  setUndoDeclined: (playerId) => set({ undoDeclined: playerId }),
  reset: () => set({
    roomCode: null,
    playerId: null,
    isCreator: false,
    creatorPlayerId: null,
    lobbyPlayers: [],
    gameState: null,
    roomSettings: null,
    lastRevision: 0,
    error: null,
    undoDeclined: null,
  }),
}));
