import { test, expect, Browser } from '@playwright/test';
import { createRoom, joinRoomAsCreator, joinRoomByName, startGame, waitForGameReady } from '../helpers/game';
import { call, allIn, waitForMyTurn, waitForShowdown, selectShowdownWinner } from '../helpers/actions';

/** Sets up a heads-up game, busts one player via an all-in hand, and resolves the showdown
 * awarding everything to the winner - leaving the loser at Stack 0, awaiting a rebuy decision. */
async function setupBustedPlayer(browser: Browser) {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const page1 = await ctx1.newPage();
  const page2 = await ctx2.newPage();

  const roomCode = await createRoom(page1, { startingStack: 1000, smallBlind: 10, bigBlind: 20 });
  await joinRoomAsCreator(page1, roomCode, 'Alice');
  await joinRoomByName(page2, roomCode, 'Bob');
  await expect(page1.getByText('2 of 9 players')).toBeVisible({ timeout: 5_000 });
  await startGame(page1, roomCode);
  await waitForGameReady(page1);
  await waitForGameReady(page2);

  const p1Active = await page1.getByText('Your Turn - Choose Action').isVisible();
  const firstToAct = p1Active ? page1 : page2;
  const other = p1Active ? page2 : page1;

  await allIn(firstToAct);
  await waitForMyTurn(other);
  await call(other);

  await waitForShowdown(page1);
  // Award the pot to whichever player acted first, busting the other to zero.
  const firstToActName = firstToAct === page1 ? 'Alice' : 'Bob';
  await selectShowdownWinner(page1, firstToActName);

  const winnerPage = firstToAct;
  const loserPage = other;

  // selectShowdownWinner fires a 1.5s confetti celebration before actually resolving the
  // showdown over SignalR - wait for the rebuy dialog so every test starts from a settled state.
  await expect(loserPage.locator('[data-testid="rebuy-dialog"]')).toBeVisible({ timeout: 5_000 });

  return { winnerPage, loserPage, ctx1, ctx2, roomCode };
}

test.describe('Rebuy / Elimination', () => {
  test('TC47 - busted player sees rebuy dialog, winner sees waiting banner, no new hand starts', async ({ browser }) => {
    const { winnerPage, loserPage, ctx1, ctx2 } = await setupBustedPlayer(browser);

    await expect(loserPage.locator('[data-testid="rebuy-dialog"]')).toBeVisible({ timeout: 5_000 });
    await expect(winnerPage.locator('[data-testid="waiting-for-rebuy"]')).toBeVisible({ timeout: 5_000 });

    // No new hand should have started - phase stepper should not show a fresh PreFlop bet cycle
    // with blinds posted twice; the pot should be empty since blinds aren't posted yet.
    await expect(winnerPage.locator('[data-testid="pot-amount"]')).toHaveText('$0', { timeout: 5_000 });

    await ctx1.close();
    await ctx2.close();
  });

  test('TC48 - loser rebuys: stack restored, new hand posts blinds', async ({ browser }) => {
    const { winnerPage, loserPage, ctx1, ctx2 } = await setupBustedPlayer(browser);

    await expect(loserPage.locator('[data-testid="rebuy-dialog"]')).toBeVisible({ timeout: 5_000 });
    await loserPage.locator('[data-testid="rebuy-confirm"]').click();

    // Rebuy dialog closes and the waiting banner disappears on both screens.
    await expect(loserPage.locator('[data-testid="rebuy-dialog"]')).not.toBeVisible({ timeout: 5_000 });
    await expect(winnerPage.locator('[data-testid="waiting-for-rebuy"]')).not.toBeVisible({ timeout: 5_000 });

    // New hand started - blinds posted, pot is non-zero.
    await expect(winnerPage.locator('[data-testid="pot-amount"]')).toHaveText('$30', { timeout: 5_000 });
    await expect(loserPage.locator('[data-testid="pot-amount"]')).toHaveText('$30', { timeout: 5_000 });

    await ctx1.close();
    await ctx2.close();
  });

  test('TC49 - loser cashes out: marked eliminated, waiting-for-players shown, buy-back-in button present', async ({ browser }) => {
    const { winnerPage, loserPage, ctx1, ctx2 } = await setupBustedPlayer(browser);

    await expect(loserPage.locator('[data-testid="rebuy-dialog"]')).toBeVisible({ timeout: 5_000 });
    await loserPage.locator('[data-testid="rebuy-decline"]').click();

    await expect(loserPage.locator('[data-testid="rebuy-dialog"]')).not.toBeVisible({ timeout: 5_000 });

    // Only one seated player remains - both screens show the waiting-for-players state.
    await expect(winnerPage.locator('[data-testid="waiting-for-players"]')).toBeVisible({ timeout: 5_000 });
    await expect(loserPage.locator('[data-testid="waiting-for-players"]')).toBeVisible({ timeout: 5_000 });

    // The eliminated player has a persistent buy-back-in option.
    await expect(loserPage.locator('[data-testid="buy-back-in-button"]')).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });

  test('TC50 - eliminated player buys back in: reseated, new hand starts', async ({ browser }) => {
    const { winnerPage, loserPage, ctx1, ctx2 } = await setupBustedPlayer(browser);

    await loserPage.locator('[data-testid="rebuy-decline"]').click();
    await expect(loserPage.locator('[data-testid="buy-back-in-button"]')).toBeVisible({ timeout: 5_000 });

    await loserPage.locator('[data-testid="buy-back-in-button"]').click();

    await expect(loserPage.locator('[data-testid="waiting-for-players"]')).not.toBeVisible({ timeout: 5_000 });
    await expect(winnerPage.locator('[data-testid="waiting-for-players"]')).not.toBeVisible({ timeout: 5_000 });

    // New hand started - blinds posted again.
    await expect(winnerPage.locator('[data-testid="pot-amount"]')).toHaveText('$30', { timeout: 5_000 });
    await expect(loserPage.locator('[data-testid="pot-amount"]')).toHaveText('$30', { timeout: 5_000 });

    await ctx1.close();
    await ctx2.close();
  });
});
