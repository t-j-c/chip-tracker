import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const api = vi.hoisted(() => ({
  submitAction: vi.fn(),
  requestUndo: vi.fn(),
  approveUndo: vi.fn(),
  declineUndo: vi.fn(),
  cancelUndo: vi.fn(),
  resolveShowdown: vi.fn(),
  rebuy: vi.fn(),
  declineRebuy: vi.fn(),
  getRoom: vi.fn(),
}));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, ...api };
});

import { useGameCommands } from './useGameCommands';
import { useGameStore } from '../stores/gameStore';
import { ApiError } from '../lib/api';

const snapshot = (revision: number) => ({
  revision,
  roomInfo: {
    roomCode: 'ABC123',
    players: [{ playerId: 'p1', name: 'Alice', stack: 1000 }],
    startingStack: 1000,
    smallBlind: 10,
    bigBlind: 20,
    maxPlayers: 9,
    isGameStarted: false,
    creatorPlayerId: 'p1',
  },
  gameState: null,
});

describe('useGameCommands', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    useGameStore.getState().reset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('applies the response snapshot', async () => {
    api.submitAction.mockResolvedValue(snapshot(7));
    const { result } = renderHook(() => useGameCommands());

    await act(async () => { await result.current.submitAction('ABC123', 'p1', 'Call', 20); });

    expect(api.submitAction).toHaveBeenCalledWith('ABC123', 'p1', 'Call', 20);
    expect(useGameStore.getState().lastRevision).toBe(7);
  });

  it('sends the right body for each showdown variant', async () => {
    api.resolveShowdown.mockResolvedValue(snapshot(1));
    const { result } = renderHook(() => useGameCommands());

    await act(async () => { await result.current.resolveShowdown('ABC123', 'p2'); });
    await act(async () => { await result.current.resolveSplitPot('ABC123'); });
    await act(async () => { await result.current.resolveShowdownWithAwards('ABC123', [{ potIndex: 0, winnerPlayerIds: ['p1'] }]); });

    expect(api.resolveShowdown.mock.calls.map((c) => c[1])).toEqual([
      { winnerPlayerId: 'p2' },
      { isSplit: true },
      { awards: [{ potIndex: 0, winnerPlayerIds: ['p1'] }] },
    ]);
  });

  it('surfaces the server error message', async () => {
    api.rebuy.mockRejectedValue(new ApiError(400, 'Cannot rebuy now'));
    const { result } = renderHook(() => useGameCommands());

    await act(async () => { await result.current.rebuy('ABC123', 'p1'); });

    expect(useGameStore.getState().error).toBe('Cannot rebuy now');
    expect(api.getRoom).not.toHaveBeenCalled();
  });

  it('resyncs after a 409', async () => {
    api.submitAction.mockRejectedValue(new ApiError(409, 'The game changed'));
    api.getRoom.mockResolvedValue(snapshot(12));
    const { result } = renderHook(() => useGameCommands());

    await act(async () => { await result.current.submitAction('ABC123', 'p1', 'Fold'); });

    expect(useGameStore.getState().error).toBe('The game changed');
    expect(api.getRoom).toHaveBeenCalledWith('ABC123');
    expect(useGameStore.getState().lastRevision).toBe(12);
  });

  it('does not surface errors for decline/cancel undo', async () => {
    api.declineUndo.mockRejectedValue(new ApiError(400, 'No pending undo request'));
    const { result } = renderHook(() => useGameCommands());

    await act(async () => { await result.current.declineUndo('ABC123', 'p2'); });

    expect(useGameStore.getState().error).toBeNull();
  });

  it('ignores a second command while one is in flight', async () => {
    let resolve!: (v: ReturnType<typeof snapshot>) => void;
    api.submitAction.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result } = renderHook(() => useGameCommands());

    let first!: Promise<void>;
    await act(async () => {
      first = result.current.submitAction('ABC123', 'p1', 'Call');
      await result.current.submitAction('ABC123', 'p1', 'Call');
    });
    expect(api.submitAction).toHaveBeenCalledTimes(1);

    await act(async () => { resolve(snapshot(2)); await first; });
    await act(async () => { await result.current.submitAction('ABC123', 'p1', 'Call'); });
    expect(api.submitAction).toHaveBeenCalledTimes(2);
  });
});
