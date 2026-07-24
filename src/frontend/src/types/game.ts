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
  players: { name: string; stack: number }[];
  smallBlind: number;
  bigBlind: number;
}

export interface CreateRoomResponse {
  success: boolean;
  roomCode?: string;
  error?: string;
}

export interface GetRoomResponse {
  success: boolean;
  gameState?: GameState;
  error?: string;
}
