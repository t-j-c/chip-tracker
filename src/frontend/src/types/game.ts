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
