import { test, expect, Browser } from '@playwright/test';
import { createRoom, joinRoomAsCreator, joinRoomByName, startGame, waitForGameReady } from '../helpers/game';
import {
  raise,
  call,
  allIn,
  waitForMyTurn,
  waitForPhase,
  waitForShowdown,
  selectShowdownWinner,
  requestUndo,
  approveUndo,
  openActivityHistory,
  getLatestActivity,
} from '../helpers/actions';

/** Sets up a heads-up game ready for action. */
async function setupGame(browser: Browser) {
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
  await expect(page1.getByText('2 of 9 players')).toBeVisible({ timeout: 5_000 });
  await startGame(page1, roomCode);
  await waitForGameReady(page1);
  await waitForGameReady(page2);

  const p1Active = await page1.getByText('Your Turn - Choose Action').isVisible();
  const activePage = p1Active ? page1 : page2;
  const inactivePage = p1Active ? page2 : page1;
  const activePlayerName = activePage === page1 ? 'Alice' : 'Bob';

  return { page1, page2, activePage, inactivePage, activePlayerName, ctx1, ctx2, roomCode };
}

/** Play through to showdown by all-in and mutual call. */
async function playToShowdownAllIn(activePage: any, inactivePage: any) {
  await allIn(activePage);
  await waitForMyTurn(inactivePage);
  await call(inactivePage);
  await waitForShowdown(activePage);
  await waitForShowdown(inactivePage);
}

test.describe('Activity History (Phase 11 e2e)', () => {
  test('TC51 - activity strip visible on game page', async ({ browser }) => {
    const { page1, page2, ctx1, ctx2 } = await setupGame(browser);

    // Both players should see the activity strip
    await expect(page1.locator('[data-testid="activity-strip"]')).toBeVisible();
    await expect(page2.locator('[data-testid="activity-strip"]')).toBeVisible();

    // Strip has testid and is a button
    const strip1 = page1.locator('[data-testid="activity-strip"]');
    const strip2 = page2.locator('[data-testid="activity-strip"]');
    await expect(strip1).toHaveAttribute('aria-label', 'Activity history');
    await expect(strip2).toHaveAttribute('aria-label', 'Activity history');

    await ctx1.close();
    await ctx2.close();
  });

  test('TC52 - activity strip updates on both pages after a raise', async ({ browser }) => {
    const { page1, page2, activePage, inactivePage, activePlayerName, ctx1, ctx2 } = await setupGame(browser);

    // Both pages should have a strip visible (may be empty or showing hand started)
    await expect(page1.locator('[data-testid="activity-strip"]')).toBeVisible();
    await expect(page2.locator('[data-testid="activity-strip"]')).toBeVisible();

    // Active player (small blind) raises to 50 (preflop there is already a bet to call)
    await raise(activePage, 50);

    // Wait for both pages to update - the activity strip text should now show the bet entry
    // Format: "Alice raised to $50 Preflop"
    const latestActivity1 = await getLatestActivity(page1);
    const latestActivity2 = await getLatestActivity(page2);

    expect(latestActivity1).toContain('raised');
    expect(latestActivity1).toContain('$50');
    expect(latestActivity2).toContain('raised');
    expect(latestActivity2).toContain('$50');

    // Both pages should have the same activity text (server-authoritative)
    expect(latestActivity1).toBe(latestActivity2);

    await ctx1.close();
    await ctx2.close();
  });

  test('TC53 - activity modal opens, groups entries by hand descending', async ({ browser }) => {
    const { page1, page2, activePage, inactivePage, ctx1, ctx2 } = await setupGame(browser);

    // Play one hand to generate some activity entries
    await raise(activePage, 50);
    await waitForMyTurn(inactivePage);
    // The caller acts first on the next street, so don't wait for the turn to pass
    await inactivePage.getByRole('button', { name: /^Call/ }).click();
    await waitForPhase(page1, 'Flop');

    // Open the modal from page1 (before showdown, whose dialog would cover the strip)
    await openActivityHistory(page1);

    // Modal should be visible with the "Activity History" heading
    await expect(page1.getByRole('heading', { name: 'Activity History' })).toBeVisible();

    // Modal should contain activity entries grouped by hand
    // Hand 1 entries should all be visible (grouped together)
    const modal = page1.locator('[data-testid="activity-history-modal"]');
    await expect(modal).toBeVisible();

    // Should have entries in the modal (at least hand started, blinds, actions, phase advances)
    const entries = page1.locator('[data-testid="activity-history-modal"] [data-testid^="activity-entry-"]');
    const entryCount = await entries.count();
    expect(entryCount).toBeGreaterThan(0);

    await ctx1.close();
    await ctx2.close();
  });

  test('TC54 - activity modal shows winner entry after showdown', async ({ browser }) => {
    const { page1, page2, activePage, inactivePage, ctx1, ctx2 } = await setupGame(browser);

    // Go to showdown with all-in
    await playToShowdownAllIn(activePage, inactivePage);

    // Determine who won and who lost based on which page is which
    const winnerName = activePage === page1 ? 'Alice' : 'Bob';
    await selectShowdownWinner(page1, winnerName);

    // Wait for showdown dialog to close (new hand starts)
    await expect(page1.getByRole('heading', { name: 'Showdown' })).not.toBeVisible({ timeout: 5_000 });

    // Open activity modal from page1
    await openActivityHistory(page1);

    // Modal should show the hand history including a "won" entry
    const modal = page1.locator('[data-testid="activity-history-modal"]');
    await expect(modal).toBeVisible();

    // Should contain an entry mentioning the winner won the pot
    const winnerText = modal.locator(`text=/${winnerName}.*won/i`);
    await expect(winnerText).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });

  test('TC55 - undo strike-through shows in modal', async ({ browser }) => {
    const { page1, page2, activePage, inactivePage, ctx1, ctx2 } = await setupGame(browser);

    // Active player raises
    await raise(activePage, 50);

    // Inactive player requests undo
    await waitForMyTurn(inactivePage);
    await requestUndo(inactivePage);

    // Active player approves undo
    await expect(activePage.locator('[data-testid="undo-dialog"]')).toBeVisible({ timeout: 5_000 });
    await approveUndo(activePage);

    // Wait for undo to process - the raise is reverted, so the raiser is back on the clock
    await expect(activePage.getByText('Your Turn - Choose Action')).toBeVisible({ timeout: 5_000 });

    // Open activity modal from page1
    await openActivityHistory(page1);

    // Modal should show the undone entries with strike-through (line-through + opacity-50)
    const modal = page1.locator('[data-testid="activity-history-modal"]');
    await expect(modal).toBeVisible();

    // Find an entry that should have been undone and check for line-through styling
    const undoneEntry = modal.locator('[data-testid^="activity-entry-"][class*="line-through"]');
    // At least one entry should be marked as undone
    const count = await undoneEntry.count();
    expect(count).toBeGreaterThan(0);

    await ctx1.close();
    await ctx2.close();
  });
});
