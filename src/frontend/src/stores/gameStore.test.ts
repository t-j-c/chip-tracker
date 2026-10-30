import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore';

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
});
