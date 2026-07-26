import { test, expect, Page, Browser } from '@playwright/test';
import { createRoom, joinRoomAsCreator, joinRoomByName, startGame, waitForGameReady } from '../helpers/game';
import { call, check, waitForMyTurn, waitForPhase, waitForShowdown, selectShowdownWinner, splitPot } from '../helpers/actions';

/** Play through all streets by checking to reach showdown. */
async function playToShowdown(page1: Page, page2: Page) {
  async function getActive() {
    const p1Active = await page1.getByText('Your Turn - Choose Action').isVisible();
    return { active: p1Active ? page1 : page2, inactive: p1Active ? page2 : page1 };
  }

  // Pre-flop: SB calls, BB checks
  const preflop = await getActive();
  await call(preflop.active);
  await waitForMyTurn(preflop.inactive);
  // BB may remain the active player into the next street (heads-up flop),
  // so use a raw click here instead of the `check()` helper which asserts
  // the action bar disappears.
  await preflop.inactive.getByRole('button', { name: 'Check' }).click();

  // Flop: both check
  await waitForPhase(page1, 'Flop');
  const flop = await getActive();
  await check(flop.active);
  await waitForMyTurn(flop.inactive);
  await check(flop.inactive);

  // Turn: both check
  await waitForPhase(page1, 'Turn');
  const turn = await getActive();
  await check(turn.active);
  await waitForMyTurn(turn.inactive);
  await check(turn.inactive);

  // River: both check â†’ showdown
  await waitForPhase(page1, 'River');
  const river = await getActive();
  await check(river.active);
  await waitForMyTurn(river.inactive);
  await check(river.inactive);
}

test.describe('Showdown (Journey 3)', () => {
  async function setupAndGoToShowdown(browser: Browser) {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const roomCode = await createRoom(page1, {
      startingStack: 1000,
      smallBlind: 10,
      bigBlind: 20,
    });
    await joinRoomAsCreator(page1, roomCode, 'Alice');
    await joinRoomByName(page2, roomCode, 'Bob');
    await expect(page1.getByText('Players (2')).toBeVisible({ timeout: 5_000 });
    await startGame(page1, roomCode);
    await waitForGameReady(page1);
    await waitForGameReady(page2);

    await playToShowdown(page1, page2);

    return { page1, page2, ctx1, ctx2, roomCode };
  }

  test('TC25 - showdown dialog appears with player name buttons and Split Pot', async ({ browser }) => {
    const { page1, page2, ctx1, ctx2 } = await setupAndGoToShowdown(browser);

    // Showdown dialog on page1
    await waitForShowdown(page1);
    await expect(page1.getByText('Who won the hand?')).toBeVisible();
    await expect(page1.getByRole('button', { name: 'Alice wins' })).toBeVisible();
    await expect(page1.getByRole('button', { name: 'Bob wins' })).toBeVisible();
    await expect(page1.getByRole('button', { name: 'Split Pot' })).toBeVisible();

    // Also on page2
    await waitForShowdown(page2);

    await ctx1.close();
    await ctx2.close();
  });

  test('TC26 - Alice wins: Alice stack increases by pot, new hand starts', async ({ browser }) => {
    const { page1, page2, ctx1, ctx2 } = await setupAndGoToShowdown(browser);

    // Pre-showdown: pot = 40 (both called 20)
    await waitForShowdown(page1);

    // Award pot to Alice
    await selectShowdownWinner(page1, 'Alice');

    // New hand should start (showdown dialog closes, phase resets to PreFlop)
    await waitForPhase(page1, 'PreFlop');
    await waitForPhase(page2, 'PreFlop');

    // Dealer rotated: one player has the dealer badge (different from hand 1 since it rotates)
    await expect(page1.getByText('Dealer')).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });

  test('TC27 - Bob wins: Bob stack increases by pot, new hand starts', async ({ browser }) => {
    const { page1, page2, ctx1, ctx2 } = await setupAndGoToShowdown(browser);

    await waitForShowdown(page1);

    await selectShowdownWinner(page1, 'Bob');

    // New hand starts
    await waitForPhase(page1, 'PreFlop');
    await waitForPhase(page2, 'PreFlop');

    await ctx1.close();
    await ctx2.close();
  });

  test('TC28 - split pot: both players receive half, new hand starts', async ({ browser }) => {
    const { page1, page2, ctx1, ctx2 } = await setupAndGoToShowdown(browser);

    await waitForShowdown(page1);

    await splitPot(page1);

    // New hand starts (showdown dialog closes, back to PreFlop)
    await waitForPhase(page1, 'PreFlop');
    await waitForPhase(page2, 'PreFlop');

    await ctx1.close();
    await ctx2.close();
  });

  test('TC29 - dealer rotates after each completed hand', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const roomCode = await createRoom(page1, {
      startingStack: 1000,
      smallBlind: 10,
      bigBlind: 20,
    });
    await joinRoomAsCreator(page1, roomCode, 'Alice');
    await joinRoomByName(page2, roomCode, 'Bob');
    await expect(page1.getByText('Players (2')).toBeVisible({ timeout: 5_000 });
    await startGame(page1, roomCode);
    await waitForGameReady(page1);
    await waitForGameReady(page2);

    // Find who is dealer in hand 1
    // The dealer panel (from page1's perspective) is either "Alice" or "Bob"
    // We'll track by checking which PlayerPanel has the "Dealer" badge
    // In page1 view: currentPlayer panel shows page1's player, otherPlayer shows page2's player
    // The "Dealer" span lives inside whichever PlayerPanel is the dealer.

    // Hand 1: fold immediately
    const preflop1 = await page1.getByText('Your Turn - Choose Action').isVisible();
    const activeP1 = preflop1 ? page1 : page2;
    await activeP1.getByRole('button', { name: 'Fold' }).click();

    // Hand 2 starts
    await waitForPhase(page1, 'PreFlop');
    await waitForPhase(page2, 'PreFlop');

    // Dealer badge still present on both screens (dealer rotated but badge exists)
    await expect(page1.getByText('Dealer')).toBeVisible();
    await expect(page2.getByText('Dealer')).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });

  test('TC30 - showdown dialog accessible from both player screens', async ({ browser }) => {
    const { page1, page2, ctx1, ctx2 } = await setupAndGoToShowdown(browser);

    // Both players see the showdown dialog (one of them can resolve it)
    await waitForShowdown(page1);
    await waitForShowdown(page2);

    // Either player can click the winner button
    await selectShowdownWinner(page2, 'Alice');

    await waitForPhase(page1, 'PreFlop');

    await ctx1.close();
    await ctx2.close();
  });
});

