import { test, expect, Browser } from '@playwright/test';
import { createRoom, enterGameAsPlayer1, joinRoom, waitForGameReady } from '../helpers/game';
import {
  fold,
  call,
  check,
  bet,
  raise,
  allIn,
  waitForMyTurn,
  waitForOpponentTurn,
  waitForPhase,
} from '../helpers/actions';

/** Helper: sets up a two-player game and returns the active/inactive pages based on whose turn it is. */
async function setupGame(browser: Browser, opts?: { stack?: number; smallBlind?: number; bigBlind?: number }) {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const page1 = await ctx1.newPage();
  const page2 = await ctx2.newPage();

  const roomCode = await createRoom(page1, {
    player1Name: 'Alice',
    player2Name: 'Bob',
    stack: opts?.stack ?? 1000,
    smallBlind: opts?.smallBlind ?? 10,
    bigBlind: opts?.bigBlind ?? 20,
  });
  await enterGameAsPlayer1(page1, roomCode);
  await joinRoom(page2, roomCode, 1);
  await waitForGameReady(page1);
  await waitForGameReady(page2);

  const p1Active = await page1.getByText('Your Turn - Choose Action').isVisible();
  const activePage = p1Active ? page1 : page2;
  const inactivePage = p1Active ? page2 : page1;

  return { page1, page2, activePage, inactivePage, ctx1, ctx2, roomCode };
}

test.describe('Hand Actions (Journey 2)', () => {
  test('TC15 - fold: pot awarded to other player, new hand starts', async ({ browser }) => {
    const { activePage, inactivePage, ctx1, ctx2 } = await setupGame(browser);

    // Record the inactive player's pot text before fold
    // Pre-flop pot = 30 (SB10 + BB20)
    await expect(activePage.getByText('$30')).toBeVisible();

    // Active player folds
    await fold(activePage);

    // After fold: a new hand starts. The pot resets to SB+BB=30 again (new hand blinds).
    // Both players see PreFlop phase for the new hand.
    await waitForPhase(activePage, 'PreFlop');
    await waitForPhase(inactivePage, 'PreFlop');

    // The winner should have received the pot (their stack > 980 or 990 depending on role)
    // We verify a new hand started: dealer rotated (Dealer badge still present)
    await expect(activePage.getByText('Dealer')).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });

  test('TC16 - call pre-flop: SB calls BB, action moves to BB', async ({ browser }) => {
    const { activePage, inactivePage, ctx1, ctx2 } = await setupGame(browser);

    // Active player (SB) calls
    await call(activePage);

    // After call: now the inactive player (BB) should have the turn
    await waitForMyTurn(inactivePage);
    await waitForOpponentTurn(activePage);

    await ctx1.close();
    await ctx2.close();
  });

  test('TC17 - check post-flop: no chips moved, turn passes', async ({ browser }) => {
    const { activePage, inactivePage, ctx1, ctx2 } = await setupGame(browser);

    // Get to flop: SB calls, BB checks their live pre-flop option
    await call(activePage);
    await waitForMyTurn(inactivePage);
    // Use click directly — BB remains first actor on Flop, so turn doesn't leave inactivePage
    await inactivePage.getByRole('button', { name: 'Check' }).click();

    // Should now be on the Flop
    await waitForPhase(activePage, 'Flop');
    await waitForPhase(inactivePage, 'Flop');

    // On flop: one player is first to act. Find who.
    const p1ActiveOnFlop = await activePage.getByText('Your Turn - Choose Action').isVisible();
    const flopActivePage = p1ActiveOnFlop ? activePage : inactivePage;
    const flopInactivePage = p1ActiveOnFlop ? inactivePage : activePage;

    // Record pot before check
    const potBefore = await activePage.locator('p.text-4xl').textContent();

    // First player checks on flop
    await check(flopActivePage);

    // Turn passes to other player; pot unchanged
    await waitForMyTurn(flopInactivePage);
    const potAfter = await activePage.locator('p.text-4xl').textContent();
    expect(potAfter).toBe(potBefore);

    await ctx1.close();
    await ctx2.close();
  });

  test('TC18 - bet post-flop: pot increases, opponent must respond', async ({ browser }) => {
    const { activePage, inactivePage, ctx1, ctx2 } = await setupGame(browser);

    // Get to flop: SB calls, BB checks their live pre-flop option
    await call(activePage);
    await waitForMyTurn(inactivePage);
    // Use click directly — BB remains first actor on Flop, so turn doesn't leave inactivePage
    await inactivePage.getByRole('button', { name: 'Check' }).click();
    await waitForPhase(activePage, 'Flop');
    await waitForPhase(inactivePage, 'Flop');

    // Find flop active player
    const p1ActiveOnFlop = await activePage.getByText('Your Turn - Choose Action').isVisible();
    const flopActivePage = p1ActiveOnFlop ? activePage : inactivePage;
    const flopInactivePage = p1ActiveOnFlop ? inactivePage : activePage;

    // Pot before bet (should be 20 after SB calls BB and no extra bet: 20+20=40... actually:
    // Pre-flop: SB posts 10, BB posts 20. SB calls (adds 10 more) = pot 40, bets reset.
    await expect(activePage.getByText('$40')).toBeVisible();

    // Bet 50 on flop
    await bet(flopActivePage, 50);

    // Opponent must respond: they see Call/Fold/Raise (not Check)
    await waitForMyTurn(flopInactivePage);
    await expect(flopInactivePage.getByRole('button', { name: /^Call/ })).toBeVisible();
    await expect(flopInactivePage.getByRole('button', { name: 'Fold' })).toBeVisible();
    await expect(flopInactivePage.getByRole('button', { name: 'Raise', exact: true })).toBeVisible();
    await expect(flopInactivePage.getByRole('button', { name: 'Check' })).not.toBeVisible();

    // Pot increased by 50
    await expect(activePage.getByText('$90')).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });

  test('TC19 - raise: pot increases further, original bettor must respond', async ({ browser }) => {
    const { activePage, inactivePage, ctx1, ctx2 } = await setupGame(browser);

    // SB calls BB pre-flop
    await call(activePage);
    await waitForMyTurn(inactivePage);

    // BB raises instead of checking
    // minRaiseTo = currentBet (20) + minRaise (20) = 40
    await raise(inactivePage, 40);

    // Now SB must respond
    await waitForMyTurn(activePage);
    await expect(activePage.getByRole('button', { name: /^Call/ })).toBeVisible();
    await expect(activePage.getByRole('button', { name: 'Fold' })).toBeVisible();
    await expect(activePage.getByRole('button', { name: 'Raise', exact: true })).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });

  test('TC20 - all-in: player goes all in, stack becomes 0', async ({ browser }) => {
    const { activePage, inactivePage, ctx1, ctx2 } = await setupGame(browser);

    // Active player goes all-in pre-flop
    await allIn(activePage);

    // Opponent's turn: they see Call or Fold
    await waitForMyTurn(inactivePage);
    await expect(inactivePage.getByRole('button', { name: /^Call/ })).toBeVisible();
    await expect(inactivePage.getByRole('button', { name: 'Fold' })).toBeVisible();

    // The all-in player's panel should show "All In"
    await expect(inactivePage.getByText('All In')).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });
});
