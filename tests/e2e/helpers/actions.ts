import { Page, expect } from '@playwright/test';

/** Click the Fold button and wait for turn to pass. */
export async function fold(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Fold' }).click();
  // After folding the action bar should disappear (no longer your turn)
  await expect(page.getByText('Waiting for your turn...')).toBeVisible({ timeout: 5_000 });
}

/** Click the Check button and wait for state update. */
export async function check(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByText('Your Turn - Choose Action')).not.toBeVisible({ timeout: 5_000 });
}

/** Click the Call button and wait for turn to pass. */
export async function call(page: Page): Promise<void> {
  const callBtn = page.getByRole('button', { name: /^Call/ });
  await callBtn.click();
  await expect(page.getByText('Your Turn - Choose Action')).not.toBeVisible({ timeout: 5_000 });
}

/**
 * Enter a bet amount and click Confirm Bet.
 * canBet=true means there's no outstanding bet (Bet action, not Raise).
 */
export async function bet(page: Page, amount: number): Promise<void> {
  // Set the bet amount input
  const betInput = page.locator('input[type="number"]').first();
  await betInput.fill(String(amount));
  await page.getByRole('button', { name: 'Confirm Bet' }).click();
  await expect(page.getByText('Your Turn - Choose Action')).not.toBeVisible({ timeout: 5_000 });
}

/**
 * Enter a raise-to amount and click Confirm Raise.
 */
export async function raise(page: Page, amount: number): Promise<void> {
  const raiseInput = page.locator('input[type="number"]').last();
  await raiseInput.fill(String(amount));
  await page.getByRole('button', { name: 'Confirm Raise' }).click();
  await expect(page.getByText('Your Turn - Choose Action')).not.toBeVisible({ timeout: 5_000 });
}

/** Click the All-In button. */
export async function allIn(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'All-In' }).click();
  await expect(page.getByText('Your Turn - Choose Action')).not.toBeVisible({ timeout: 5_000 });
}

/** Wait until it is this player's turn (action bar visible). */
export async function waitForMyTurn(page: Page): Promise<void> {
  await expect(page.getByText('Your Turn - Choose Action')).toBeVisible({ timeout: 5_000 });
}

/** Wait until it is NOT this player's turn (waiting state visible). */
export async function waitForOpponentTurn(page: Page): Promise<void> {
  await expect(page.getByText('Waiting for your turn...')).toBeVisible({ timeout: 5_000 });
}

/** Wait until the phase displayed matches expectedPhase. */
export async function waitForPhase(page: Page, expectedPhase: string): Promise<void> {
  await expect(page.locator('.text-yellow-300').first()).toHaveText(expectedPhase, { timeout: 5_000 });
}

/** Wait for the showdown dialog to appear. */
export async function waitForShowdown(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Showdown' })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText('Who won the hand?')).toBeVisible();
}

/** Click the winner button in the showdown dialog (matches player name). */
export async function selectShowdownWinner(page: Page, playerName: string): Promise<void> {
  await page.getByRole('button', { name: `${playerName} wins` }).click();
}

/** Click Split Pot in the showdown dialog. */
export async function splitPot(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Split Pot' }).click();
}

/** Click Request Undo button. */
export async function requestUndo(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Request Undo' }).click();
}

/** Approve the undo request. */
export async function approveUndo(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Approve' }).click();
}

/** Decline the undo request. */
export async function declineUndo(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Decline' }).click();
}
