import { test, expect, Browser } from '@playwright/test';
import { createRoom, joinRoomAsCreator, joinRoomByName, startGame, waitForGameReady } from '../helpers/game';
import { call, waitForMyTurn, requestUndo, approveUndo, declineUndo } from '../helpers/actions';

test.describe('Undo Flow (Journey: Undo)', () => {
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

    return { page1, page2, ctx1, ctx2, roomCode };
  }

  test('TC31 - request undo shows Undo Request dialog on opponent screen', async ({ browser }) => {
    const { page1, page2, ctx1, ctx2 } = await setupGame(browser);

    // Find who acts first (SB) and have them call
    const p1Active = await page1.getByText('Your Turn - Choose Action').isVisible();
    const actingPage = p1Active ? page1 : page2;
    const opponentPage = p1Active ? page2 : page1;

    // Make a call action so there's something to undo
    await call(actingPage);
    await waitForMyTurn(opponentPage);

    // The player who just acted requests undo
    await requestUndo(actingPage);

    // The undo pending indicator becomes visible in the header
    await expect(actingPage.locator('[data-testid="undo-pending"]')).toBeVisible({ timeout: 5_000 });

    // Opponent sees the undo banner with correct text and action buttons
    await expect(opponentPage.getByText(/wants to undo the last action/i)).toBeVisible();
    await expect(opponentPage.getByRole('button', { name: 'Approve' })).toBeVisible();
    await expect(opponentPage.getByRole('button', { name: 'Decline' })).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });

  test('TC32 - approve undo: game state reverts to before the action', async ({ browser }) => {
    const { page1, page2, ctx1, ctx2 } = await setupGame(browser);

    // Initial pot = 30 (SB:10 + BB:20)
    await expect(page1.getByText('$30')).toBeVisible();

    const p1Active = await page1.getByText('Your Turn - Choose Action').isVisible();
    const actingPage = p1Active ? page1 : page2;
    const opponentPage = p1Active ? page2 : page1;

    // SB calls → pot becomes 40
    await call(actingPage);
    await waitForMyTurn(opponentPage);
    await expect(page1.getByText('$40')).toBeVisible();

    // Requester asks for undo
    await requestUndo(actingPage);

    // Opponent approves
    await approveUndo(opponentPage);

    // State reverts: pot back to 30, actingPage has turn back
    await expect(page1.getByText('$30')).toBeVisible({ timeout: 5_000 });
    await waitForMyTurn(actingPage);

    await ctx1.close();
    await ctx2.close();
  });

  test('TC33 - decline undo: game state unchanged, play continues', async ({ browser }) => {
    const { page1, page2, ctx1, ctx2 } = await setupGame(browser);

    const p1Active = await page1.getByText('Your Turn - Choose Action').isVisible();
    const actingPage = p1Active ? page1 : page2;
    const opponentPage = p1Active ? page2 : page1;

    // SB calls
    await call(actingPage);
    await waitForMyTurn(opponentPage);

    // Pot = 40 after call
    await expect(page1.getByText('$40')).toBeVisible();

    // Requester asks for undo
    await requestUndo(actingPage);

    // Opponent declines
    await declineUndo(opponentPage);

    // Undo dialog disappears on opponent
    await expect(opponentPage.getByText('Undo Request')).not.toBeVisible({ timeout: 5_000 });

    // State unchanged: pot still 40
    await expect(page1.getByText('$40')).toBeVisible();

    // Opponent still has their turn
    await waitForMyTurn(opponentPage);

    // Requesting player sees "Undo was declined" message
    await expect(actingPage.getByText(/Undo was declined/i)).toBeVisible({ timeout: 5_000 });

    await ctx1.close();
    await ctx2.close();
  });

  test('TC34 - requester name shown correctly in undo dialog', async ({ browser }) => {
    const { page1, page2, ctx1, ctx2 } = await setupGame(browser);

    const p1Active = await page1.getByText('Your Turn - Choose Action').isVisible();
    const actingPage = p1Active ? page1 : page2;
    const opponentPage = p1Active ? page2 : page1;

    await call(actingPage);
    await waitForMyTurn(opponentPage);
    await requestUndo(actingPage);

    // The undo banner should mention the requesting player's name
    const undoTextEl = opponentPage.getByText(/wants to undo the last action/i);
    await expect(undoTextEl).toBeVisible({ timeout: 5_000 });
    const dialogText = await undoTextEl.textContent();
    // Should mention Alice or Bob
    expect(dialogText).toMatch(/Alice|Bob/);

    await ctx1.close();
    await ctx2.close();
  });
});

