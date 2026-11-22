import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ActivityEntry, GameState } from '../types/game';

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
vi.mock('../lib/sound', () => ({ playSound: vi.fn() }));
vi.mock('../lib/haptics', () => ({ vibrate: vi.fn(), HAPTICS: { action: 15, turn: [1], win: [1] } }));

import confetti from 'canvas-confetti';
import { playSound } from '../lib/sound';
import { useTableEvents, BUBBLE_MS } from './useTableEvents';

const entry = (sequence: number, extra: Partial<ActivityEntry>): ActivityEntry => ({
  sequence, entryType: 'PlayerAction', amount: 0, stateVersion: sequence,
  isUndone: false, handNumber: 1, ...extra,
});
const state = (recentActivity: ActivityEntry[], activePlayerTurnId: string | null = null): GameState => ({
  players: [], pot: 0, currentBet: 0, activePlayerTurnId, phase: 'PreFlop',
  dealerIndex: 0, smallBlind: 10, bigBlind: 20, minRaise: 20,
  isHandActive: true, pots: [], recentActivity,
});

describe('useTableEvents', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
  afterEach(() => vi.useRealTimers());

  it('treats the first snapshot as history and shows bubbles only for new actions', () => {
    const announce = vi.fn();
    const first = state([entry(1, { playerId: 'p2', action: 'Bet' })]);
    const { result, rerender } = renderHook(({ gs }) => useTableEvents(gs, 'p1', announce), { initialProps: { gs: first } });
    expect(result.current.bubbles).toEqual({});
    rerender({ gs: state([...first.recentActivity!, entry(2, { playerId: 'p2', action: 'Raise' })]) });
    expect(result.current.bubbles.p2).toEqual({ key: 2, action: 'Raise' });
    act(() => vi.advanceTimersByTime(BUBBLE_MS));
    expect(result.current.bubbles).toEqual({});
  });

  it('celebrates on this device only when the hero wins a pot', () => {
    const announce = vi.fn();
    const first = state([entry(1, { entryType: 'HandStarted' })]);
    const { result, rerender } = renderHook(({ gs }) => useTableEvents(gs, 'p1', announce), { initialProps: { gs: first } });
    rerender({ gs: state([...first.recentActivity!, entry(2, { entryType: 'PotWon', playerId: 'p2', playerName: 'Bob', amount: 40 })]) });
    expect(result.current.wins.p2).toEqual({ key: 2, amount: 40 });
    expect(announce).toHaveBeenCalledWith('Bob won the pot');
    expect(confetti).not.toHaveBeenCalled();
    rerender({ gs: state([entry(3, { entryType: 'PotWon', playerId: 'p1', playerName: 'Alice', amount: 60 })]) });
    expect(confetti).toHaveBeenCalledTimes(1);
    expect(playSound).toHaveBeenCalledWith('win');
  });

  it('plays the turn sound when the turn moves to the hero', () => {
    const { rerender } = renderHook(({ gs }) => useTableEvents(gs, 'p1', vi.fn()), { initialProps: { gs: state([], 'p2') } });
    expect(playSound).not.toHaveBeenCalled();
    rerender({ gs: state([], 'p1') });
    expect(playSound).toHaveBeenCalledWith('turn');
  });
});
