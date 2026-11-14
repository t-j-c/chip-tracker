import { describe, it, expect } from 'vitest';
import { moveSeat, opponentsInSeatOrder } from './seating';

describe('moveSeat', () => {
  it('swaps with the neighbour in the given direction', () => {
    expect(moveSeat(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveSeat(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
  });

  it('leaves the order unchanged when moving past either end', () => {
    expect(moveSeat(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveSeat(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });
});

describe('opponentsInSeatOrder', () => {
  const players = ['p1', 'p2', 'p3', 'p4'].map(playerId => ({ playerId }));

  it('starts with the player to your left and wraps around the table', () => {
    expect(opponentsInSeatOrder(players, 'p3').map(p => p.playerId)).toEqual(['p4', 'p1', 'p2']);
  });

  it('keeps table order for spectators', () => {
    expect(opponentsInSeatOrder(players, null).map(p => p.playerId)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });
});
