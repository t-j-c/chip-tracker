import { test, expect, Browser, Page } from '@playwright/test';
import { createRoom, joinRoomAsCreator, joinRoomByName, startGame, waitForGameReady } from '../helpers/game';
import { call, fold, raise, waitForMyTurn } from '../helpers/actions';

/**
 * Three players in the lobby, not started yet. Join order (= default seating):
 * page1=Alice (creator), page2=Bob, page3=Cara.
 */
async function setupLobbyWithThree(browser: Browser) {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const ctx3 = await browser.newContext();
  const page1 = await ctx1.newPage();
  const page2 = await ctx2.newPage();
  const page3 = await ctx3.newPage();

  const roomCode = await createRoom(page1, { startingStack: 1000, smallBlind: 10, bigBlind: 20 });
  await joinRoomAsCreator(page1, roomCode, 'Alice');
  await joinRoomByName(page2, roomCode, 'Bob');
  await joinRoomByName(page3, roomCode, 'Cara');
  await expect(page1.getByText('3 of 9 players')).toBeVisible({ timeout: 5_000 });

  const close = async () => {
    await ctx1.close();
    await ctx2.close();
    await ctx3.close();
  };
  return { page1, page2, page3, roomCode, close };
}

async function startAndWait(roomCode: string, ...pages: Page[]) {
  await startGame(pages[0], roomCode);
  for (const page of pages) await waitForGameReady(page);
}

const selfPanel = (page: Page) => page.locator('[data-testid="self-player-panel"]');
const opponents = (page: Page) => page.locator('[data-testid^="opponent-panel-"]');

async function openMenuItem(page: Page, testId: string) {
  await page.locator('[data-testid="overflow-menu-btn"]').click();
  await page.locator(`[data-testid="${testId}"]`).click();
}

test.describe('Seating order and restart hand (room creator tools)', () => {
  test('TC62 - creator reorders seats in the lobby; everyone sees it and the first seat deals first', async ({ browser }) => {
    const { page1, page2, page3, roomCode, close } = await setupLobbyWithThree(browser);

    // Only the creator gets the move controls.
    await expect(page2.getByRole('button', { name: /^Move .* up$/ })).toHaveCount(0);

    // Move Cara to the top: Cara, Alice, Bob.
    await page1.getByRole('button', { name: 'Move Cara up' }).click();
    await expect(page1.locator('[data-testid="lobby-player-1"]')).toContainText('Cara');
    await page1.getByRole('button', { name: 'Move Cara up' }).click();
    await expect(page1.locator('[data-testid="lobby-player-0"]')).toContainText('Cara');

    // Pushed to the other lobbies.
    await expect(page2.locator('[data-testid="lobby-player-0"]')).toContainText('Cara');
    await expect(page3.locator('[data-testid="lobby-player-2"]')).toContainText('Bob');

    await startAndWait(roomCode, page1, page2, page3);

    // Dealer Cara acts first three-handed; Alice posts the small blind, Bob the big blind.
    await waitForMyTurn(page3);
    await expect(selfPanel(page3)).toContainText('Dealer');
    await expect(selfPanel(page1)).toContainText('Your bet: $10');
    await expect(selfPanel(page2)).toContainText('Your bet: $20');

    // Alice sees the table clockwise from her left: Bob, then Cara.
    await expect(opponents(page1).nth(0)).toContainText('Bob');
    await expect(opponents(page1).nth(1)).toContainText('Cara');

    await close();
  });

  test('TC63 - mid-hand reorder waits for the next hand, then the button moves in the new order', async ({ browser }) => {
    const { page1, page2, page3, roomCode, close } = await setupLobbyWithThree(browser);
    await startAndWait(roomCode, page1, page2, page3);

    // Hand 1: dealer Alice (acts first), SB Bob, BB Cara.
    await waitForMyTurn(page1);

    // Bob can't change seating.
    await page2.locator('[data-testid="overflow-menu-btn"]').click();
    await expect(page2.locator('[data-testid="menu-seat-order"]')).toHaveCount(0);
    await page2.locator('[data-testid="overflow-menu-btn"]').click();

    // Alice swaps Cara and Bob: Alice, Cara, Bob.
    await openMenuItem(page1, 'menu-seat-order');
    await expect(page1.locator('[data-testid="seat-order-dialog"]')).toBeVisible();
    await page1.getByRole('button', { name: 'Move Cara up' }).click();
    await page1.locator('[data-testid="seat-order-save"]').click();
    await expect(page1.locator('[data-testid="seat-order-dialog"]')).not.toBeVisible();

    // Queued for everyone; the hand in progress is untouched.
    for (const page of [page1, page2, page3]) {
      await expect(page.locator('[data-testid="seat-order-pending"]')).toBeVisible({ timeout: 5_000 });
    }
    await waitForMyTurn(page1);

    // Finish hand 1: Alice and Bob fold, Cara takes the blinds.
    await fold(page1);
    await waitForMyTurn(page2);
    await fold(page2);

    // Hand 2 in the new order: the button moves from Alice to Cara (her left now), SB Bob, BB Alice.
    await waitForMyTurn(page3);
    await expect(selfPanel(page3)).toContainText('Dealer');
    await expect(selfPanel(page2)).toContainText('Your bet: $10');
    await expect(selfPanel(page1)).toContainText('Your bet: $20');
    for (const page of [page1, page2, page3]) {
      await expect(page.locator('[data-testid="seat-order-pending"]')).not.toBeVisible();
    }
    await expect(opponents(page1).nth(0)).toContainText('Cara');
    await expect(opponents(page1).nth(1)).toContainText('Bob');

    await close();
  });

  test('TC64 - restart hand returns every bet and re-deals with the same dealer', async ({ browser }) => {
    const { page1, page2, page3, roomCode, close } = await setupLobbyWithThree(browser);
    await startAndWait(roomCode, page1, page2, page3);

    // Dealer Alice raises to 100, Bob (SB) calls; it's Cara's (BB) turn with $220 in the pot.
    await waitForMyTurn(page1);
    await raise(page1, 100);
    await waitForMyTurn(page2);
    await call(page2);
    await waitForMyTurn(page3);
    await expect(page1.locator('[data-testid="pot-amount"]')).toHaveText('$220', { timeout: 5_000 });

    // Only the creator gets the override.
    await page2.locator('[data-testid="overflow-menu-btn"]').click();
    await expect(page2.locator('[data-testid="menu-restart-hand"]')).toHaveCount(0);
    await page2.locator('[data-testid="overflow-menu-btn"]').click();

    await openMenuItem(page1, 'menu-restart-hand');
    await page1.locator('[data-testid="restart-hand-confirm"]').click();

    // Bets returned and blinds re-posted by the same seats; the dealer acts first again.
    for (const page of [page1, page2, page3]) {
      await expect(page.locator('[data-testid="pot-amount"]')).toHaveText('$30', { timeout: 5_000 });
    }
    await waitForMyTurn(page1);
    await expect(selfPanel(page1)).toContainText('Dealer');
    await expect(selfPanel(page1)).toContainText('$1,000');
    await expect(selfPanel(page2)).toContainText('$990');
    await expect(selfPanel(page3)).toContainText('$980');

    await close();
  });

  test('TC65 - a player whose device forgot them can take their seat back', async ({ browser }) => {
    const { page1, page2, page3, roomCode, close } = await setupLobbyWithThree(browser);
    await startAndWait(roomCode, page1, page2, page3);

    await page2.evaluate(() => {
      sessionStorage.clear();
      localStorage.clear();
    });
    await page2.reload();
    await waitForGameReady(page2);

    const picker = page2.locator('[data-testid="pick-player"]');
    await expect(picker).toBeVisible();
    await picker.getByRole('button', { name: 'Bob', exact: true }).click();

    await expect(picker).not.toBeVisible();
    await expect(selfPanel(page2)).toContainText('Bob');

    await close();
  });
});
