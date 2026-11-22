import { describe, it, expect } from 'vitest';
import { opponentLayout, seatAngle, HERO_BET_POINT } from './tableLayout';

describe('tableLayout', () => {
  it('puts the hero at the bottom and spaces seats clockwise', () => {
    expect(seatAngle(0, 4)).toBe(90);
    expect(seatAngle(1, 4)).toBe(180);
    expect(seatAngle(2, 4)).toBe(270);
  });
  it('seats a heads-up opponent at the top centre', () => {
    const [spot] = opponentLayout(1);
    expect(spot.seat).toEqual({ x: 50, y: 10 });
    expect(spot.bet).toEqual({ x: 50, y: 28 });
  });
  it('goes left, top, right for three opponents (clockwise from the hero)', () => {
    expect(opponentLayout(3).map(s => s.seat)).toEqual([
      { x: 12, y: 50 }, { x: 50, y: 10 }, { x: 88, y: 50 },
    ]);
  });
  it('returns one spot per opponent with bets closer to the centre than seats', () => {
    const spots = opponentLayout(8);
    expect(spots).toHaveLength(8);
    for (const { seat, bet } of spots) {
      expect(Math.hypot(bet.x - 50, bet.y - 50)).toBeLessThan(Math.hypot(seat.x - 50, seat.y - 50));
    }
  });
  it('places the hero bet chip below the centre', () => {
    expect(HERO_BET_POINT).toEqual({ x: 50, y: 72 });
  });
});
