import type { GameState, PotAward, RoomInfo, RoomSnapshot } from '../types/game';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Command/GET responses carry a snapshot; it is always present on success. */
export interface SnapshotResponse extends RoomSnapshot {
  roomInfo: RoomInfo;
  gameState: GameState | null;
}

const baseUrl = () => import.meta.env.VITE_API_URL ?? '';

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    throw new ApiError(0, `Failed to reach server: ${err}`);
  }

  let data: { success?: boolean; error?: string | null } | null = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON error bodies fall through to the generic message below.
  }

  if (!res.ok || !data || data.success === false) {
    throw new ApiError(res.status, data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

const roomPath = (roomCode: string) => `/api/rooms/${encodeURIComponent(roomCode)}`;

export const getRoom = (roomCode: string) => request<SnapshotResponse>('GET', roomPath(roomCode));

export const joinRoom = (roomCode: string, name: string) =>
  request<SnapshotResponse & { playerId: string; isCreator: boolean }>('POST', `${roomPath(roomCode)}/join`, { name });

export const startGame = (roomCode: string, playerId: string) =>
  request<SnapshotResponse>('POST', `${roomPath(roomCode)}/start`, { playerId });

export const submitAction = (roomCode: string, playerId: string, action: string, amount?: number) =>
  request<SnapshotResponse>('POST', `${roomPath(roomCode)}/actions`, { playerId, action, amount });

export const requestUndo = (roomCode: string, playerId: string) =>
  request<SnapshotResponse>('POST', `${roomPath(roomCode)}/undo/request`, { playerId });

export const approveUndo = (roomCode: string, playerId: string) =>
  request<SnapshotResponse>('POST', `${roomPath(roomCode)}/undo/approve`, { playerId });

export const declineUndo = (roomCode: string, playerId: string) =>
  request<SnapshotResponse>('POST', `${roomPath(roomCode)}/undo/decline`, { playerId });

export const cancelUndo = (roomCode: string, playerId: string) =>
  request<SnapshotResponse>('POST', `${roomPath(roomCode)}/undo/cancel`, { playerId });

export type ShowdownBody = { winnerPlayerId: string } | { isSplit: true } | { awards: PotAward[] };

export const resolveShowdown = (roomCode: string, body: ShowdownBody) =>
  request<SnapshotResponse>('POST', `${roomPath(roomCode)}/showdown`, body);

export const rebuy = (roomCode: string, playerId: string) =>
  request<SnapshotResponse>('POST', `${roomPath(roomCode)}/rebuy`, { playerId });

export const declineRebuy = (roomCode: string, playerId: string) =>
  request<SnapshotResponse>('POST', `${roomPath(roomCode)}/decline-rebuy`, { playerId });
