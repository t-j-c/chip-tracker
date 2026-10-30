import { useCallback, useRef } from 'react';
import { useGameStore } from '../stores/gameStore';
import * as api from '../lib/api';
import { ApiError } from '../lib/api';
import type { PokerAction, PotAward } from '../types/game';

/** REST command helpers. Each applies the response snapshot and reports failures via the store. */
export const useGameCommands = () => {
  const inFlight = useRef(false);
  const setError = useGameStore((s) => s.setError);

  const run = useCallback(
    async (roomCode: string, call: () => Promise<api.SnapshotResponse>, options?: { silent?: boolean }) => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const snapshot = await call();
        useGameStore.getState().applySnapshot(snapshot);
      } catch (err) {
        console.error('Command failed:', err);
        if (!options?.silent) {
          setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
        }
        if (err instanceof ApiError && err.status === 409) {
          try {
            useGameStore.getState().applySnapshot(await api.getRoom(roomCode));
          } catch (resyncErr) {
            console.error('Error resyncing room:', resyncErr);
          }
        }
      } finally {
        inFlight.current = false;
      }
    },
    [setError],
  );

  const submitAction = useCallback(
    (roomCode: string, playerId: string, action: PokerAction, amount?: number) =>
      run(roomCode, () => api.submitAction(roomCode, playerId, action, amount)),
    [run],
  );

  /** Sends an undo request to the other player; does not modify game state. */
  const requestUndo = useCallback(
    (roomCode: string, playerId: string) => run(roomCode, () => api.requestUndo(roomCode, playerId)),
    [run],
  );

  /** Approves an undo, actually reverting the state. Called by the receiving player. */
  const approveUndo = useCallback(
    (roomCode: string, playerId: string) => run(roomCode, () => api.approveUndo(roomCode, playerId)),
    [run],
  );

  /** Declines an undo; notifies the requester. No state change. */
  const declineUndo = useCallback(
    (roomCode: string, playerId: string) => run(roomCode, () => api.declineUndo(roomCode, playerId), { silent: true }),
    [run],
  );

  /** Cancels an in-flight undo request. */
  const cancelUndo = useCallback(
    (roomCode: string, playerId: string) => run(roomCode, () => api.cancelUndo(roomCode, playerId), { silent: true }),
    [run],
  );

  const resolveShowdown = useCallback(
    (roomCode: string, winnerPlayerId: string) =>
      run(roomCode, () => api.resolveShowdown(roomCode, { winnerPlayerId })),
    [run],
  );

  const resolveSplitPot = useCallback(
    (roomCode: string) => run(roomCode, () => api.resolveShowdown(roomCode, { isSplit: true })),
    [run],
  );

  /** Resolves a showdown with one winner-list per pot (used when the hand has side pots). */
  const resolveShowdownWithAwards = useCallback(
    (roomCode: string, awards: PotAward[]) => run(roomCode, () => api.resolveShowdown(roomCode, { awards })),
    [run],
  );

  /** Buys a busted (or previously eliminated) player back in for the room's starting stack. */
  const rebuy = useCallback(
    (roomCode: string, playerId: string) => run(roomCode, () => api.rebuy(roomCode, playerId)),
    [run],
  );

  /** Cashes a busted player out instead of rebuying. */
  const declineRebuy = useCallback(
    (roomCode: string, playerId: string) => run(roomCode, () => api.declineRebuy(roomCode, playerId)),
    [run],
  );

  return {
    submitAction,
    requestUndo,
    approveUndo,
    declineUndo,
    cancelUndo,
    resolveShowdown,
    resolveSplitPot,
    resolveShowdownWithAwards,
    rebuy,
    declineRebuy,
  };
};
