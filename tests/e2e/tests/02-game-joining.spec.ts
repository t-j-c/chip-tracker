import { test, expect } from '@playwright/test';
import { createRoom, enterGameAsPlayer1, joinRoom, waitForGameReady } from '../helpers/game';

test.describe('Game Joining (Journey 1 - Connection)', () => {
  test('TC06 - join via manual room code entry shows player selection', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const roomCode = await createRoom(page1, { player1Name: 'Alice', player2Name: 'Bob' });

    // Player 2 goes to /join, enters code manually
    await page2.goto('/join');
    await page2.getByLabel('Room Code').fill(roomCode);
    await page2.getByRole('button', { name: 'Look Up' }).click();

    // Player selection appears
    await expect(page2.getByText('Select your player:')).toBeVisible();
    await expect(page2.getByRole('button', { name: 'Alice' })).toBeVisible();
    await expect(page2.getByRole('button', { name: 'Bob' })).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });

  test('TC07 - join via deep link (/join?room=CODE) auto-looks up room', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const roomCode = await createRoom(page1, { player1Name: 'Alice', player2Name: 'Bob' });

    // Simulate QR code scan: navigate directly to the deep link
    await page2.goto(`/join?room=${roomCode}`);

    // Auto-lookup fires on mount; player selection should appear without clicking Look Up
    await expect(page2.getByText('Select your player:')).toBeVisible();
    await expect(page2.getByRole('button', { name: 'Alice' })).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });

  test('TC08 - invalid room code shows error', async ({ page }) => {
    await page.goto('/join');
    await page.getByLabel('Room Code').fill('XXXXXX');
    await page.getByRole('button', { name: 'Look Up' }).click();

    await expect(page.getByText(/Room not found/i)).toBeVisible();
    // No player buttons should appear
    await expect(page.getByText('Select your player:')).not.toBeVisible();
  });

  test('TC09 - full two-player connection: both enter game and see game state', async ({ browser }) => {
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

    // Player 1 enters game
    await enterGameAsPlayer1(page1, roomCode);

    // Player 2 joins and selects themselves
    await joinRoom(page2, roomCode, 1);

    // Both should be on the game page
    await waitForGameReady(page1);
    await waitForGameReady(page2);

    // Both see the room code in header
    await expect(page1.getByText(`Room: ${roomCode}`)).toBeVisible();
    await expect(page2.getByText(`Room: ${roomCode}`)).toBeVisible();

    // Game state is synchronized: both see a pot with SB+BB = 30
    await expect(page1.getByText('$30')).toBeVisible();
    await expect(page2.getByText('$30')).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });

  test('TC10 - player name is pre-filled from room code in URL', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const roomCode = await createRoom(page1, { player1Name: 'Charlie', player2Name: 'Diana' });

    await page2.goto(`/join?room=${roomCode}`);

    // The room code input should be pre-filled
    await expect(page2.getByLabel('Room Code')).toHaveValue(roomCode);

    await ctx1.close();
    await ctx2.close();
  });
});
