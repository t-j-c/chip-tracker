import { test, expect, Page, Browser } from '@playwright/test';
import { createRoom, enterGameAsPlayer1, joinRoom, waitForGameReady } from '../helpers/game';
import { call, check, waitForMyTurn, waitForPhase, waitForShowdown } from '../helpers/actions';

/** Returns the page with the active turn. */
async function getActivePage(page1: Page, page2: Page) {
  const p1Active = await page1.getByText('Your Turn - Choose Action').isVisible();
  return { activePage: p1Active ? page1 : page2, inactivePage: p1Active ? page2 : page1 };
}

/** Play a full street where both players check (or call if needed). Assumes pot already equalized. */
async function checkBothThrough(page1: Page, page2: Page) {
  const { activePage, inactivePage } = await getActivePage(page1, page2);
  await check(activePage);
  await waitForMyTurn(inactivePage);
  await check(inactivePage);
}

test.describe('Street Progression (Journey 2)', () => {
  async function setupAndGoToFlop(browser: Browser) {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const roomCode = await createRoom(page1, {
      player1Name: 'Alice',
      player2Name: 'Bob',
      stack: 1000,
      smallBlind: 10,
      bigBlind: 20,
    });
    await enterGameAsPlayer1(page1, roomCode);
    await joinRoom(page2, roomCode, 1);
    await waitForGameReady(page1);
    await waitForGameReady(page2);

    // Pre-flop: SB calls, BB checks → advance to Flop
    const { activePage } = await getActivePage(page1, page2);
    const inactivePage = activePage === page1 ? page2 : page1;
    await call(activePage);
    await waitForMyTurn(inactivePage);
    await inactivePage.getByRole('button', { name: 'Check' }).click();
    await waitForPhase(page1, 'Flop');

    return { page1, page2, ctx1, ctx2, roomCode };
  }

  test('TC21 - PreFlop to Flop: bets reset, pot preserved', async ({ browser }) => {
    const { page1, page2, ctx1, ctx2 } = await setupAndGoToFlop(browser);

    // On the Flop: phase is Flop
    await expect(page1.locator('.text-yellow-300').first()).toHaveText('Flop');
    await expect(page2.locator('.text-yellow-300').first()).toHaveText('Flop');

    // Pot preserved: both players called 20 → pot = 40
    await expect(page1.getByText('$40')).toBeVisible();

    // Player bets reset to 0 (the "Bet:" values on player panels should be 0)
    // We verify by checking that Check is available (no outstanding bet)
    const { activePage } = await getActivePage(page1, page2);
    await expect(activePage.getByRole('button', { name: 'Check' })).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });

  test('TC22 - full PreFlop → Flop → Turn → River by checking through', async ({ browser }) => {
    const { page1, page2, ctx1, ctx2 } = await setupAndGoToFlop(browser);

    // Flop: both check
    await checkBothThrough(page1, page2);
    await waitForPhase(page1, 'Turn');

    // Turn: both check
    await checkBothThrough(page1, page2);
    await waitForPhase(page1, 'River');

    // River: both check
    await checkBothThrough(page1, page2);

    // Should now be at Showdown
    await waitForShowdown(page1);

    await ctx1.close();
    await ctx2.close();
  });

  test('TC23 - pot stays constant when no betting occurs across streets', async ({ browser }) => {
    const { page1, page2, ctx1, ctx2 } = await setupAndGoToFlop(browser);

    const potOnFlop = await page1.locator('p.text-4xl').textContent();

    // Check through flop
    await checkBothThrough(page1, page2);
    await waitForPhase(page1, 'Turn');

    // Pot unchanged on Turn
    const potOnTurn = await page1.locator('p.text-4xl').textContent();
    expect(potOnTurn).toBe(potOnFlop);

    // Check through turn
    await checkBothThrough(page1, page2);
    await waitForPhase(page1, 'River');

    // Pot unchanged on River
    const potOnRiver = await page1.locator('p.text-4xl').textContent();
    expect(potOnRiver).toBe(potOnFlop);

    await ctx1.close();
    await ctx2.close();
  });

  test('TC24 - phase label updates on both players screens simultaneously', async ({ browser }) => {
    const { page1, page2, ctx1, ctx2 } = await setupAndGoToFlop(browser);

    // Both should show Flop
    await expect(page1.locator('.text-yellow-300').first()).toHaveText('Flop');
    await expect(page2.locator('.text-yellow-300').first()).toHaveText('Flop');

    // Check through flop
    await checkBothThrough(page1, page2);

    // Both should show Turn
    await expect(page1.locator('.text-yellow-300').first()).toHaveText('Turn');
    await expect(page2.locator('.text-yellow-300').first()).toHaveText('Turn');

    await ctx1.close();
    await ctx2.close();
  });
});
