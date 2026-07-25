import { test, expect } from '@playwright/test';
import { createRoom, joinRoomByName, joinRoomAsCreator, createAndStartGame, waitForGameReady } from '../helpers/game';

test.describe('Game Joining (Journey 1 - Connection)', () => {
  test('TC06 - join via manual room code entry shows name input', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const roomCode = await createRoom(page1);

    // Player 2 goes to /join, enters code manually
    await page2.goto('/join');
    await page2.getByLabel('Room Code').fill(roomCode);
    await page2.getByRole('button', { name: 'Look Up' }).click();

    // Name input appears (game not started yet)
    await expect(page2.getByLabel('Your Name')).toBeVisible();
    await expect(page2.getByRole('button', { name: 'Join Game' })).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });

  test('TC07 - join via deep link (/join?room=CODE) auto-looks up room', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const roomCode = await createRoom(page1);

    // Simulate QR code scan
    await page2.goto(`/join?room=${roomCode}`);

    // Auto-lookup fires; name input appears without clicking Look Up
    await expect(page2.getByLabel('Your Name')).toBeVisible({ timeout: 5_000 });

    await ctx1.close();
    await ctx2.close();
  });

  test('TC08 - invalid room code shows error', async ({ page }) => {
    await page.goto('/join');
    await page.getByLabel('Room Code').fill('XXXXXX');
    await page.getByRole('button', { name: 'Look Up' }).click();

    await expect(page.getByText(/Room not found/i)).toBeVisible();
    await expect(page.getByLabel('Your Name')).not.toBeVisible();
  });

  test('TC09 - full two-player lobby → start → both see game state', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const roomCode = await createAndStartGame(page1, page2, 'Alice', 'Bob', {
      startingStack: 1000,
      smallBlind: 10,
      bigBlind: 20,
    });

    // Both should be on the game page
    await waitForGameReady(page1);
    await waitForGameReady(page2);

    // Both see the room code in header
    await expect(page1.getByText(`Room: ${roomCode}`)).toBeVisible();
    await expect(page2.getByText(`Room: ${roomCode}`)).toBeVisible();

    // Game state is synchronized: SB+BB = 30
    await expect(page1.getByText('$30')).toBeVisible();
    await expect(page2.getByText('$30')).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });

  test('TC10 - room code is pre-filled from URL query param', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const roomCode = await createRoom(page1);

    await page2.goto(`/join?room=${roomCode}`);

    // The room code input should be pre-filled
    await expect(page2.getByLabel('Room Code')).toHaveValue(roomCode);

    await ctx1.close();
    await ctx2.close();
  });

  test('TC11 - only creator sees Start Game button', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const roomCode = await createRoom(page1);
    await joinRoomAsCreator(page1, roomCode, 'Alice');
    await joinRoomByName(page2, roomCode, 'Bob');

    // Creator sees Start Game button
    await expect(page1.getByRole('button', { name: 'Start Game' })).toBeVisible();

    // Non-creator does not see Start Game button
    await expect(page2.getByRole('button', { name: 'Start Game' })).not.toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });

  test('TC12 - Start Game is disabled until 2+ players have joined', async ({ page }) => {
    const roomCode = await createRoom(page);
    await joinRoomAsCreator(page, roomCode, 'Alice');

    // Only 1 player — Start Game should be disabled
    const startBtn = page.getByRole('button', { name: 'Start Game' });
    await expect(startBtn).toBeVisible();
    await expect(startBtn).toBeDisabled();
  });
});
