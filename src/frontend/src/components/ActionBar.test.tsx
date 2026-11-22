import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ActionBar from './ActionBar';
import type { ActivityEntry, GameState, Player } from '../types/game';

const hero: Player = {
  playerId: 'p1',
  name: 'Alice',
  stack: 980,
  currentBet: 0,
  hasFolded: false,
  isAllIn: false,
  isDealer: false,
  isAwaitingRebuy: false,
  isEliminated: false,
};

const handStarted: ActivityEntry = {
  sequence: 1,
  entryType: 'HandStarted',
  amount: 0,
  stateVersion: 1,
  isUndone: false,
  handNumber: 1,
};

const flop = (activePlayerTurnId: string, currentBet: number): GameState => ({
  players: [hero, { ...hero, playerId: 'p2', name: 'Bob', currentBet }],
  pot: 40 + currentBet,
  currentBet,
  activePlayerTurnId,
  phase: 'Flop',
  dealerIndex: 0,
  smallBlind: 10,
  bigBlind: 20,
  minRaise: 20,
  isHandActive: true,
  pots: [],
  recentActivity: [handStarted],
});

describe('ActionBar pre-actions', () => {
  it('fires a queued Check/Fold as a fold when the hero faces a bet', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <ActionBar gameState={flop('p2', 0)} playerId="p1" onAction={onAction} isYourTurn={false} />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'Check/Fold' }));
    expect(screen.getByRole('checkbox', { name: 'Check/Fold' })).toHaveAttribute('aria-checked', 'true');

    rerender(<ActionBar gameState={flop('p1', 50)} playerId="p1" onAction={onAction} isYourTurn />);
    expect(onAction).toHaveBeenCalledWith('Fold', undefined);
  });

  it('drops a queued pre-action when the street changes before the turn arrives', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <ActionBar gameState={flop('p2', 0)} playerId="p1" onAction={onAction} isYourTurn={false} />,
    );
    await user.click(screen.getByRole('checkbox', { name: 'Call Any' }));

    rerender(<ActionBar gameState={{ ...flop('p1', 0), phase: 'Turn' }} playerId="p1" onAction={onAction} isYourTurn />);
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByText('Your Turn - Choose Action')).toBeInTheDocument();
  });
});
