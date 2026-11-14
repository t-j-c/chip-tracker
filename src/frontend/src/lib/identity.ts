export interface RememberedPlayer {
  playerId: string;
  isCreator: boolean;
}

const playerKey = (roomCode: string) => `playerId_${roomCode}`;
const creatorKey = (roomCode: string) => `isCreator_${roomCode}`;

// Per tab first (lets one browser hold several players in different tabs), then a durable
// fallback so a phone that discards or reopens the tab doesn't lose its seat.
const stores = (): Storage[] => {
  const result: Storage[] = [];
  try { result.push(window.sessionStorage); } catch { /* storage blocked */ }
  try { result.push(window.localStorage); } catch { /* storage blocked */ }
  return result;
};

/** Remembers which player this device is in a room. */
export function rememberPlayer(roomCode: string, playerId: string, isCreator: boolean): void {
  for (const storage of stores()) {
    try {
      storage.setItem(playerKey(roomCode), playerId);
      storage.setItem(creatorKey(roomCode), String(isCreator));
    } catch {
      // Quota or private-mode failures just mean we can't remember the seat.
    }
  }
}

/** Returns the player this device was in the room, if remembered. */
export function recallPlayer(roomCode: string): RememberedPlayer | null {
  for (const storage of stores()) {
    try {
      const playerId = storage.getItem(playerKey(roomCode));
      if (playerId) return { playerId, isCreator: storage.getItem(creatorKey(roomCode)) === 'true' };
    } catch {
      // Ignore unreadable storage and try the next one.
    }
  }
  return null;
}
