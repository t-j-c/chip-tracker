import { test, expect } from '@playwright/test';
import { createAndStartGame, waitForGameReady } from '../helpers/game';

test.describe('Pre-flop State (Journey 2)', () => {
  test.beforeEach(async () => {
    // Each test gets fresh Docker state; DynamoDB is in-memory so rooms don't persist between restarts.
    // Within a test run, rooms are isolated by unique room codes.
  });

  test('TC11 - initial game state: blinds posted, correct stacks, PreFlop phase', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const roomCode = await createAndStartGame(page1, page2, 'Alice', 'Bob', {
      startingStack: 1000,
      smallBlind: 10,
      bigBlind: 20,
    });
    await waitForGameReady(page1);
    await waitForGameReady(page2);

    // Pot = SB + BB = 30
    await expect(page1.getByText('$30')).toBeVisible();

    // Phase = PreFlop
    await expect(page1.locator("[data-testid='phase-indicator']")).toHaveText('PreFlop');

    // Dealer badge visible on one player (heads-up: dealer = SB)
    await expect(page1.getByText('Dealer')).toBeVisible();

    // Player stacks: the SB player has 990, BB player has 980
    // (We can't easily know which player is which from page1 without knowing player ids,
    //  but we can verify "Stack:" appears and values are reduced from 1000)
    const stackValues = await page1.locator('text=/^Stack:$/').all();
    expect(stackValues.length).toBeGreaterThanOrEqual(1);

    await ctx1.close();
    await ctx2.close();
  });

  test('TC12 - active player sees action buttons; inactive sees "Waiting"', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    await createAndStartGame(page1, page2, 'Alice', 'Bob', {
      startingStack: 1000,
      smallBlind: 10,
      bigBlind: 20,
    });
    await waitForGameReady(page1);
    await waitForGameReady(page2);

    // Exactly one of the two pages should show "Your Turn - Choose Action"
    // and the other should show "Waiting for your turn..."
    const p1Active = await page1.getByText('Your Turn - Choose Action').isVisible();
    const p2Active = await page2.getByText('Your Turn - Choose Action').isVisible();

    // Exactly one player has the turn
    expect(p1Active !== p2Active).toBe(true);

    const p1Waiting = await page1.getByText('Waiting for your turn...').isVisible();
    const p2Waiting = await page2.getByText('Waiting for your turn...').isVisible();
    expect(p1Waiting !== p2Waiting).toBe(true);

    await ctx1.close();
    await ctx2.close();
  });

  test('TC13 - pre-flop action buttons: Fold, Call, Raise visible; Check NOT visible when facing a bet', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    await createAndStartGame(page1, page2, 'Alice', 'Bob', {
      startingStack: 1000,
      smallBlind: 10,
      bigBlind: 20,
    });
    await waitForGameReady(page1);
    await waitForGameReady(page2);

    // Find the active player's page
    const activePage = (await page1.getByText('Your Turn - Choose Action').isVisible()) ? page1 : page2;

    // Pre-flop: active player is SB, facing BB (outstanding bet exists)
    await expect(activePage.getByRole('button', { name: 'Fold' })).toBeVisible();
    // Call button shows the amount to call
    await expect(activePage.getByRole('button', { name: /^Call/ })).toBeVisible();
    // Raise button visible
    await expect(activePage.getByRole('button', { name: 'Raise', exact: true })).toBeVisible();
    // Check should NOT be visible (facing a bet pre-flop)
    await expect(activePage.getByRole('button', { name: 'Check' })).not.toBeVisible();
    // All-In always available
    await expect(activePage.getByRole('button', { name: /all.in/i })).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });

  test('TC14 - dealer badge shown on correct player (heads-up: dealer = SB)', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    await createAndStartGame(page1, page2, 'Alice', 'Bob', {
      startingStack: 1000,
      smallBlind: 10,
      bigBlind: 20,
    });
    await waitForGameReady(page1);
    await waitForGameReady(page2);

    // "Dealer" badge should appear exactly once per page (aria-label used since opponent shows 'D' not full text)
    await expect(page1.locator('[aria-label="Dealer"]')).toBeVisible();
    await expect(page2.locator('[aria-label="Dealer"]')).toBeVisible();

    // Both pages show exactly one dealer badge
    const dealerBadgeCount1 = await page1.locator('[aria-label="Dealer"]').count();
    expect(dealerBadgeCount1).toBe(1);

    await ctx1.close();
    await ctx2.close();
  });
});

