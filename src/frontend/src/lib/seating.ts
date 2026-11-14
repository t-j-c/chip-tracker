/** Moves the item at `index` one place up (-1) or down (+1); out-of-range moves return the list unchanged. */
export function moveSeat<T>(order: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= order.length || target < 0 || target >= order.length) return [...order];
  const next = [...order];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * Everyone except `selfId`, in clockwise seat order starting with the player to their left
 * (the next seat after theirs). Spectators (no matching seat) get the table order unchanged.
 */
export function opponentsInSeatOrder<T extends { playerId: string }>(players: readonly T[], selfId: string | null): T[] {
  const selfIndex = players.findIndex(p => p.playerId === selfId);
  if (selfIndex < 0) return [...players];
  return [...players.slice(selfIndex + 1), ...players.slice(0, selfIndex)];
}
