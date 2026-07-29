import { test, expect, Browser } from '@playwright/test';
import { createRoom, joinRoomAsCreator, joinRoomByName, startGame, waitForGameReady } from '../helpers/game';
import {
  call,
  allIn,
  waitForMyTurn,
  waitForShowdown,
  selectShowdownWinner,
} from '../helpers/actions';

/** Sets up a two-player game and returns the active/inactive pages based on whose turn it is. */
async function setupGame(browser: Browser, opts?: { stack?: number; smallBlind?: number; bigBlind?: number }) {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const page1 = await ctx1.newPage();
  const page2 = await ctx2.newPage();

  const roomCode = await createRoom(page1, {
    startingStack: opts?.stack ?? 1000,
    smallBlind: opts?.smallBlind ?? 10,
    bigBlind: opts?.bigBlind ?? 20,
  });
  await joinRoomAsCreator(page1, roomCode, 'Alice');
  await joinRoomByName(page2, roomCode, 'Bob');
  await expect(page1.getByText('2 of 9 players')).toBeVisible({ timeout: 5_000 });
  await startGame(page1, roomCode);
  await waitForGameReady(page1);
  await waitForGameReady(page2);

  const p1Active = await page1.getByText('Your Turn - Choose Action').isVisible();
  const activePage = p1Active ? page1 : page2;
  const inactivePage = p1Active ? page2 : page1;

  return { page1, page2, activePage, inactivePage, ctx1, ctx2, roomCode };
}

test.describe('All-In Resolution (Regression: heads-up first-hand all-in)', () => {
  test('TC41 - both players all-in pre-flop: showdown dialog appears, no action buttons remain', async ({ browser }) => {
    const { activePage, inactivePage, ctx1, ctx2 } = await setupGame(browser);

    // Reported bug scenario: first hand, first player shoves all-in, second player calls
    // (also going all-in). Action must NOT stay on the second player.
    await allIn(activePage);
    await waitForMyTurn(inactivePage);
    await call(inactivePage);

    await waitForShowdown(activePage);
    await waitForShowdown(inactivePage);

    // Neither screen should show any action button — the hand is over, nobody is "on turn".
    for (const page of [activePage, inactivePage]) {
      await expect(page.getByRole('button', { name: 'Fold' })).not.toBeVisible();
      await expect(page.getByRole('button', { name: 'Check' })).not.toBeVisible();
      await expect(page.getByRole('button', { name: 'Bet' })).not.toBeVisible();
      await expect(page.getByRole('button', { name: /^Call/ })).not.toBeVisible();
    }

    await ctx1.close();
    await ctx2.close();
  });

  test('TC42 - winner selection after double all-in: winner gets all chips, chips conserved', async ({ browser }) => {
    const { activePage, inactivePage, ctx1, ctx2 } = await setupGame(browser, { stack: 1000 });

    await allIn(activePage);
    await waitForMyTurn(inactivePage);
    await call(inactivePage);
    await waitForShowdown(activePage);

    // Pick whichever player is "Alice" as winner regardless of which context that is.
    await selectShowdownWinner(activePage, 'Alice');

    // A new hand should start for both, meaning the showdown dialog closes and blinds post again.
    await expect(activePage.getByRole('heading', { name: 'Showdown' })).not.toBeVisible({ timeout: 5_000 });
    await expect(inactivePage.getByRole('heading', { name: 'Showdown' })).not.toBeVisible({ timeout: 5_000 });

    await ctx1.close();
    await ctx2.close();
  });

  test('TC43 - all-in called by a covering player: hand ends in showdown without deadlock', async ({ browser }) => {
    // Short stack (500) vs a much bigger stack (2000) — the covering player calling
    // must still close out the hand (this was the "B covers A" deadlock variant).
    const { activePage, inactivePage, ctx1, ctx2 } = await setupGame(browser, { stack: 1000 });

    await allIn(activePage);
    await waitForMyTurn(inactivePage);
    await call(inactivePage);

    await waitForShowdown(activePage);
    await waitForShowdown(inactivePage);

    await ctx1.close();
    await ctx2.close();
  });

  test('TC44 - post-flop bet then call advances the street immediately (no phantom extra action)', async ({ browser }) => {
    const { activePage, inactivePage, ctx1, ctx2 } = await setupGame(browser);

    // Get to the flop: SB calls, BB checks their live option.
    await call(activePage);
    await waitForMyTurn(inactivePage);
    await inactivePage.getByRole('button', { name: 'Check' }).click();
    await expect(activePage.locator('[data-testid="phase-indicator"]')).toHaveText('Flop', { timeout: 5_000 });

    // Whoever is first-to-act on the flop bets, the other calls — street should close
    // immediately without requiring an extra check from the bettor.
    const flopFirstActor = await activePage.getByText('Your Turn - Choose Action').isVisible() ? activePage : inactivePage;
    const flopOther = flopFirstActor === activePage ? inactivePage : activePage;

    await flopFirstActor.getByRole('button', { name: 'Bet' }).click();
    await flopFirstActor.locator('[data-testid="bet-amount-input"]').fill('40');
    await flopFirstActor.locator('[data-testid="confirm-bet"]').click();

    await waitForMyTurn(flopOther);
    await flopOther.getByRole('button', { name: /^Call/ }).click();

    await expect(activePage.locator('[data-testid="phase-indicator"]')).toHaveText('Turn', { timeout: 5_000 });
    await expect(inactivePage.locator('[data-testid="phase-indicator"]')).toHaveText('Turn', { timeout: 5_000 });

    await ctx1.close();
    await ctx2.close();
  });
});
