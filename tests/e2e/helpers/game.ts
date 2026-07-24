import { Page, expect } from '@playwright/test';

export interface CreateRoomOptions {
  player1Name?: string;
  player2Name?: string;
  stack?: number;
  smallBlind?: number;
  bigBlind?: number;
}

/**
 * Navigate to the create-room page, fill the form, submit, and return the room code.
 * After this call the page is showing the "Room Created!" confirmation screen.
 */
export async function createRoom(page: Page, opts: CreateRoomOptions = {}): Promise<string> {
  const {
    player1Name = 'Alice',
    player2Name = 'Bob',
    stack = 1000,
    smallBlind = 10,
    bigBlind = 20,
  } = opts;

  await page.goto('/');

  // Fill player names (inputs have default values so clear first)
  await page.getByLabel('Player 1 Name').fill(player1Name);
  await page.getByLabel('Player 2 Name').fill(player2Name);
  await page.getByLabel('Starting Stack').fill(String(stack));
  await page.getByLabel('Small Blind').fill(String(smallBlind));
  await page.getByLabel('Big Blind').fill(String(bigBlind));

  await page.getByRole('button', { name: 'Create Game' }).click();

  // Wait for room code to appear
  await expect(page.getByText('Room Created!')).toBeVisible();
  const roomCodeEl = page.locator('p.text-4xl');
  await expect(roomCodeEl).toBeVisible();
  const roomCode = (await roomCodeEl.textContent()) ?? '';
  return roomCode.trim();
}

/**
 * Navigate to /join, enter the room code, and click the player button matching playerIndex (0 or 1).
 * After this call the page navigates to /room/CODE.
 */
export async function joinRoom(page: Page, roomCode: string, playerIndex: 0 | 1 = 1): Promise<void> {
  await page.goto('/join');
  await page.getByLabel('Room Code').fill(roomCode);
  await page.getByRole('button', { name: 'Look Up' }).click();

  // Wait for player list
  await expect(page.getByText('Select your player:')).toBeVisible();
  const playerButtons = page.getByRole('button').filter({ hasText: /^(?!Look Up|Look up).+/ });

  // Select by index among the player-selection buttons
  const allPlayerBtns = await page.locator('button.bg-green-500').all();
  await allPlayerBtns[playerIndex].click();

  // Navigates to /room/CODE
  await page.waitForURL(`**/room/${roomCode}`);
}

/**
 * Enter the game as Player 1 from the "Room Created!" confirmation screen.
 */
export async function enterGameAsPlayer1(page: Page, roomCode: string): Promise<void> {
  await page.getByRole('button', { name: /I'm Player 1/i }).click();
  await page.waitForURL(`**/room/${roomCode}`);
}

/**
 * Wait until the game state has loaded (the page shows game content, not "Connecting...").
 */
export async function waitForGameReady(page: Page): Promise<void> {
  await expect(page.getByText('Chip Tracker').first()).toBeVisible();
  // "Connecting to game..." loading state should be gone
  await expect(page.getByText('Connecting to game...')).not.toBeVisible({ timeout: 15_000 });
}

/**
 * Get the pot value currently displayed on the page.
 */
export async function getPot(page: Page): Promise<number> {
  const potEl = page.locator('text=/^\\$\\d+$/').first();
  const text = await potEl.textContent();
  return parseInt((text ?? '0').replace('$', ''), 10);
}

/**
 * Get the phase text from PotDisplay.
 */
export async function getPhase(page: Page): Promise<string> {
  const phaseEl = page.locator('.text-yellow-300').first();
  return (await phaseEl.textContent()) ?? '';
}
