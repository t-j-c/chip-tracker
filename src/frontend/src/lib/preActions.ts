import { PokerAction } from '../types/game';

/** Actions a waiting player can queue so they fire the moment their turn arrives. */
export type PreActionKind = 'checkFold' | 'check' | 'callAny';

export const PRE_ACTION_KINDS: readonly PreActionKind[] = ['checkFold', 'check', 'callAny'];

export const PRE_ACTION_LABELS: Record<PreActionKind, string> = {
  checkFold: 'Check/Fold',
  check: 'Check',
  callAny: 'Call Any',
};

/**
 * The action a queued pre-action turns into once it's the player's turn, or null when it no
 * longer applies (a plain "Check" after someone bet). The server turns a short-stacked Call
 * into an all-in.
 */
export function resolvePreAction(kind: PreActionKind, canCheck: boolean): PokerAction | null {
  switch (kind) {
    case 'checkFold':
      return canCheck ? PokerAction.Check : PokerAction.Fold;
    case 'check':
      return canCheck ? PokerAction.Check : null;
    case 'callAny':
      return canCheck ? PokerAction.Check : PokerAction.Call;
  }
}
