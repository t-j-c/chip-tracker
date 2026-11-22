import type { Player } from '../types/game';

export interface Standing {
  playerId: string;
  name: string;
  stack: number;
  seatIndex: number;
  rank: number;
  share: number;
  isEliminated: boolean;
}

export function computeStandings(players: readonly Player[]): Standing[] {
  const total = players.reduce((sum, p) => sum + p.stack, 0);
  const sorted = players
    .map((player, seatIndex) => ({ player, seatIndex }))
    .sort((a, b) => b.player.stack - a.player.stack || a.player.name.localeCompare(b.player.name));

  let rank = 0;
  let lastStack: number | null = null;
  return sorted.map(({ player, seatIndex }, i) => {
    if (player.stack !== lastStack) {
      rank = i + 1;
      lastStack = player.stack;
    }
    return {
      playerId: player.playerId,
      name: player.name,
      stack: player.stack,
      seatIndex,
      rank,
      share: total > 0 ? player.stack / total : 0,
      isEliminated: player.isEliminated,
    };
  });
}
