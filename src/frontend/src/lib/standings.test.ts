import { describe, it, expect } from 'vitest';
import { computeStandings } from './standings';
import type { Player } from '../types/game';

const player = (playerId: string, name: string, stack: number): Player => ({
  playerId, name, stack, currentBet: 0, hasFolded: false, isAllIn: false,
  isDealer: false, isAwaitingRebuy: false, isEliminated: false,
});

describe('computeStandings', () => {
  it('ranks by stack with shared ranks for ties and keeps the seat index', () => {
    const standings = computeStandings([
      player('a', 'Alice', 500), player('b', 'Bob', 1500),
      player('c', 'Cara', 500), player('d', 'Dan', 0),
    ]);
    expect(standings.map(s => [s.name, s.rank, s.seatIndex])).toEqual([
      ['Bob', 1, 1], ['Alice', 2, 0], ['Cara', 2, 2], ['Dan', 4, 3],
    ]);
    expect(standings[0].share).toBeCloseTo(0.6);
  });
  it('reports zero share when no chips are in stacks', () => {
    expect(computeStandings([player('a', 'Alice', 0)])[0].share).toBe(0);
  });
});
