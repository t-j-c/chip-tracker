export const PokerAction = {
  Fold: 'Fold',
  Check: 'Check',
  Call: 'Call',
  Bet: 'Bet',
  Raise: 'Raise',
  AllIn: 'AllIn',
} as const;
export type PokerAction = (typeof PokerAction)[keyof typeof PokerAction];

export const GamePhase = {
  PreFlop: 'PreFlop',
  Flop: 'Flop',
  Turn: 'Turn',
  River: 'River',
  Showdown: 'Showdown',
} as const;
export type GamePhase = (typeof GamePhase)[keyof typeof GamePhase];

export interface Player {
  playerId: string;
  name: string;
  stack: number;
  currentBet: number;
  hasFolded: boolean;
  isAllIn: boolean;
  isDealer: boolean;
  isAwaitingRebuy: boolean;
  isEliminated: boolean;
}

export interface PotShare {
  amount: number;
  eligiblePlayerIds: string[];
}

export interface PotAward {
  potIndex: number;
  winnerPlayerIds: string[];
}

export interface GameState {
  players: Player[];
  pot: number;
  currentBet: number;
  activePlayerTurnId: string | null;
  phase: string;
  dealerIndex: number;
  smallBlind: number;
  bigBlind: number;
  minRaise: number;
  isHandActive: boolean;
  pots: PotShare[];
  recentActivity?: ActivityEntry[];
  pendingUndoRequestBy?: string | null;
}

/** What every REST command response and every pushed event carries. */
export interface RoomSnapshot {
  revision: number;
  roomInfo?: RoomInfo | null;
  gameState?: GameState | null;
}

export type RoomEventType =
  | 'playerJoined'
  | 'gameStarted'
  | 'gameStateUpdated'
  | 'undoRequested'
  | 'undoDeclined'
  | 'undoCancelled';

export interface RoomEvent extends RoomSnapshot {
  type: RoomEventType;
  roomCode: string;
  actorPlayerId?: string | null;
  /** Set when the event was too large to carry a snapshot: the client must resync via GET. */
  stale?: boolean;
}

export interface ActionRequest {
  playerId: string;
  action: PokerAction;
  amount?: number;
}

export interface CreateRoomRequest {
  startingStack: number;
  smallBlind: number;
  bigBlind: number;
}

export interface CreateRoomResponse {
  success: boolean;
  roomCode?: string;
  error?: string;
}

export interface JoinRoomRequest {
  name: string;
}

export interface JoinRoomResponse {
  success: boolean;
  playerId?: string;
  isCreator?: boolean;
  error?: string;
}

export interface RoomInfo {
  roomCode: string;
  players: { playerId: string; name: string; stack: number }[];
  startingStack: number;
  smallBlind: number;
  bigBlind: number;
  maxPlayers: number;
  isGameStarted: boolean;
  creatorPlayerId: string | null;
}

export interface GetRoomResponse {
  success: boolean;
  roomInfo?: RoomInfo;
  gameState?: GameState;
  error?: string;
}

export const ActivityEntryType = {
  PlayerAction: 'PlayerAction',
  PhaseAdvanced: 'PhaseAdvanced',
  PotWon: 'PotWon',
  BlindPosted: 'BlindPosted',
  Refund: 'Refund',
  Rebuy: 'Rebuy',
  CashOut: 'CashOut',
  HandStarted: 'HandStarted',
} as const;
export type ActivityEntryType = (typeof ActivityEntryType)[keyof typeof ActivityEntryType];

export interface ActivityEntry {
  sequence: number;
  entryType: ActivityEntryType;
  playerId?: string;
  action?: PokerAction;
  amount: number;
  oldPhase?: GamePhase;
  newPhase?: GamePhase;
  stateVersion: number;
  isUndone: boolean;
  playerName?: string;
  phase?: GamePhase;
  potIndex?: number;
  blindType?: 'SmallBlind' | 'BigBlind';
  handNumber: number;
}

export interface GetActivityLogResponse {
  success: boolean;
  entries?: ActivityEntry[];
  error?: string;
}
