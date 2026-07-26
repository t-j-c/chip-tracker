import { Page, expect } from '@playwright/test';

export interface CreateRoomOptions {
  startingStack?: number;
  smallBlind?: number;
  bigBlind?: number;
}

/**
 * Navigate to the create-room page, fill the form (no player names), submit,
 * and return the room code. After this call the page is at /room/CODE/lobby.
 */
export async function createRoom(page: Page, opts: CreateRoomOptions = {}): Promise<string> {
  const {
    startingStack = 1000,
    smallBlind = 10,
    bigBlind = 20,
  } = opts;

  await page.goto('/');

  await page.getByLabel('Starting Stack').fill(String(startingStack));
  await page.getByLabel('Small Blind').fill(String(smallBlind));
  await page.getByLabel('Big Blind').fill(String(bigBlind));

  await page.getByRole('button', { name: 'Create Game' }).click();

  // Navigates to lobby page
  await page.waitForURL('**/lobby', { timeout: 5_000 });

  // Extract room code from URL /room/CODE/lobby
  const url = page.url();
  const match = url.match(/\/room\/([A-Z0-9]{6})\/lobby/);
  return match?.[1] ?? '';
}

/**
 * Join a room by name. Page navigates to /room/CODE/lobby after joining.
 * If the game is already started, navigates to /join with the room code pre-filled.
 */
export async function joinRoomByName(page: Page, roomCode: string, playerName: string): Promise<void> {
  await page.goto(`/join?room=${roomCode}`);

  // Wait for name input to appear (game not yet started)
  await expect(page.getByLabel('Your Name')).toBeVisible({ timeout: 5_000 });
  await page.getByLabel('Your Name').fill(playerName);
  await page.getByRole('button', { name: 'Join Game' }).click();

  // Should navigate to lobby
  await page.waitForURL(`**/room/${roomCode}/lobby`);
}

/**
 * Start the game from the lobby (creator only).
 * After this call the page navigates to /room/CODE.
 */
export async function startGame(page: Page, roomCode: string): Promise<void> {
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.waitForURL(`**/room/${roomCode}`, { timeout: 5_000 });
}

/**
 * Full flow: create room, join as creator with a given name, then join a second player,
 * then start the game. Returns the room code.
 */
export async function createAndStartGame(
  creatorPage: Page,
  joinerPage: Page,
  creatorName = 'Alice',
  joinerName = 'Bob',
  opts: CreateRoomOptions = {}
): Promise<string> {
  const roomCode = await createRoom(creatorPage, opts);
  await joinRoomAsCreator(creatorPage, roomCode, creatorName);
  await joinRoomByName(joinerPage, roomCode, joinerName);
  // Wait for creator's lobby to show 2 players
  await expect(creatorPage.getByText('Players (2')).toBeVisible({ timeout: 5_000 });
  await startGame(creatorPage, roomCode);
  return roomCode;
}

/**
 * Join as the creator from the lobby page (creator is already on the lobby page
 * after createRoom). Fills in the join form on the lobby.
 */
export async function joinRoomAsCreator(page: Page, roomCode: string, playerName: string): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`/room/${roomCode}/lobby`));
  await page.getByLabel('Your Name').fill(playerName);
  await page.getByRole('button', { name: 'Join Game' }).click();
  // Form disappears immediately once playerId is set (alreadyJoined = !!playerId)
  await expect(page.getByRole('button', { name: 'Join Game' })).not.toBeVisible({ timeout: 5_000 });
}

/**
 * Wait until the game state has loaded (the page shows game content, not "Connecting...").
 */
export async function waitForGameReady(page: Page): Promise<void> {
  await expect(page.locator('[data-testid="game-page"]')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText('Connecting to game...')).not.toBeVisible({ timeout: 5_000 });
}

/**
 * Get the pot value currently displayed on the page.
 */
export async function getPot(page: Page): Promise<number> {
  const potEl = page.locator('[data-testid="pot-amount"]').first();
  const text = await potEl.textContent();
  return parseInt((text ?? '0').replace(/[$,]/g, ''), 10);
}

/**
 * Get the phase text from PhaseStepper.
 */
export async function getPhase(page: Page): Promise<string> {
  const phaseEl = page.locator('[data-testid="phase-indicator"]').first();
  return (await phaseEl.textContent()) ?? '';
}

