import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGameStore } from './gameStore';
import type { RoomSnapshot } from '../types/game';

const info = (name: string) => ({
  roomCode: 'ABC123',
  players: [{ playerId: 'p1', name, stack: 1000 }],
  startingStack: 1000,
  smallBlind: 10,
  bigBlind: 20,
  maxPlayers: 9,
  isGameStarted: false,
  creatorPlayerId: 'p1',
});

describe('applySnapshot', () => {
  beforeEach(() => useGameStore.getState().reset());

  it('applies only strictly newer revisions', () => {
    const { applySnapshot } = useGameStore.getState();

    expect(applySnapshot({ revision: 3, roomInfo: info('A'), gameState: null })).toBe(true);
    expect(applySnapshot({ revision: 3, roomInfo: info('Same'), gameState: null })).toBe(false);
    expect(applySnapshot({ revision: 2, roomInfo: info('Old'), gameState: null })).toBe(false);

    const state = useGameStore.getState();
    expect(state.lobbyPlayers[0].name).toBe('A');
    expect(state.lastRevision).toBe(3);
    expect(state.roomSettings).toEqual({ startingStack: 1000, smallBlind: 10, bigBlind: 20 });
    expect(state.creatorPlayerId).toBe('p1');
  });

  it('resets the revision when switching rooms', () => {
    const store = useGameStore.getState();
    store.setRoomCode('AAAAAA');
    store.applySnapshot({ revision: 10, roomInfo: info('A'), gameState: null });

    store.setRoomCode('AAAAAA');
    expect(useGameStore.getState().lastRevision).toBe(10);

    store.setRoomCode('BBBBBB');
    expect(useGameStore.getState().lastRevision).toBe(0);
  });

  it('rejects invalid revisions without corrupting the ordering guard', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { applySnapshot } = useGameStore.getState();
      expect(applySnapshot({ revision: 3, roomInfo: info('A') })).toBe(true);
      for (const json of ['{}', '{"revision":"4"}', '{"revision":null}']) {
        const invalid: RoomSnapshot = JSON.parse(json);
        expect(applySnapshot(invalid)).toBe(false);
      }
      expect(applySnapshot({ revision: Number.NaN, roomInfo: info('Invalid') })).toBe(false);
      expect(applySnapshot({ revision: 2, roomInfo: info('Old') })).toBe(false);
      expect(useGameStore.getState().lastRevision).toBe(3);
      expect(useGameStore.getState().lobbyPlayers[0].name).toBe('A');
      expect(error).toHaveBeenCalledTimes(4);
    } finally {
      error.mockRestore();
    }
  });
});
