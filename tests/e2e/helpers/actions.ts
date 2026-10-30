import { Page, expect } from '@playwright/test';

/** Click the Fold button and wait for turn to pass. */
export async function fold(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Fold' }).click();
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
 * Move the active bet/raise slider to an exact amount and confirm.
 */
async function setPickerAmount(page: Page, type: 'bet' | 'raise', amount: number): Promise<void> {
  const slider = page.getByRole('slider', { name: /amount$/i });
  await slider.focus();

  await page.keyboard.press('Home');
  let current = Number(await slider.getAttribute('aria-valuenow'));
  const target = amount;

  if (current !== target) {
    await page.keyboard.press('PageUp');
    const afterPageUp = Number(await slider.getAttribute('aria-valuenow'));
    const largeStep = Math.max(Math.abs(afterPageUp - current), 1);
    current = afterPageUp;

    while (current < target) {
      const remaining = target - current;
      if (remaining >= largeStep) {
        await page.keyboard.press('PageUp');
      } else {
        await page.keyboard.press('ArrowRight');
      }
      const next = Number(await slider.getAttribute('aria-valuenow'));
      if (next === current) break;
      current = next;
    }

    while (current > target) {
      const remaining = current - target;
      if (remaining >= largeStep) {
        await page.keyboard.press('PageDown');
      } else {
        await page.keyboard.press('ArrowLeft');
      }
      const next = Number(await slider.getAttribute('aria-valuenow'));
      if (next === current) break;
      current = next;
    }
  }

  if (current !== target) {
    throw new Error(`Failed to set ${type} amount to ${amount}, ended at ${current}`);
  }

  const display = page.locator(`[data-testid="${type}-amount-input"]`);
  await expect(display).toHaveText(`$${target.toLocaleString()}`);
}

/**
 * Open the Bet amount picker, choose an amount with the slider, and confirm.
 */
export async function bet(page: Page, amount: number): Promise<void> {
  await page.getByRole('button', { name: 'Bet' }).click();
  await setPickerAmount(page, 'bet', amount);
  await page.locator('[data-testid="confirm-bet"]').click();
  await expect(page.getByText('Your Turn - Choose Action')).not.toBeVisible({ timeout: 5_000 });
}

/**
 * Open the Raise amount picker, choose a raise-to amount with the slider, and confirm.
 */
export async function raise(page: Page, amount: number): Promise<void> {
  await page.getByRole('button', { name: 'Raise' }).click();
  await setPickerAmount(page, 'raise', amount);
  await page.locator('[data-testid="confirm-raise"]').click();
  await expect(page.getByText('Your Turn - Choose Action')).not.toBeVisible({ timeout: 5_000 });
}

/** Click the All-In button. */
export async function allIn(page: Page): Promise<void> {
  await page.getByRole('button', { name: /all.in/i }).click();
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
  await expect(page.locator('[data-testid="phase-indicator"]')).toHaveText(expectedPhase, { timeout: 5_000 });
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

/** Open overflow menu and click Request Undo. */
export async function requestUndo(page: Page): Promise<void> {
  await page.locator('[data-testid="overflow-menu-btn"]').click();
  await page.locator('[data-testid="menu-request-undo"]').click();
}

/** Approve an undo request from the UndoDialog. */
export async function approveUndo(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Approve' }).click();
}

/** Decline an undo request from the UndoDialog. */
export async function declineUndo(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Decline' }).click();
}

/** Cancel the local undo-pending banner. */
export async function cancelUndo(page: Page): Promise<void> {
  await page.locator('[data-testid="undo-cancel"]').click();
}

/** Open the activity history modal from the activity strip. */
export async function openActivityHistory(page: Page): Promise<void> {
  // The activity strip is a button with aria-label="Activity history"
  const stripButton = page.locator('[data-testid="activity-strip"]');
  await stripButton.click();
  // Wait for modal to appear
  await expect(page.getByRole('heading', { name: 'Activity History' })).toBeVisible({ timeout: 5_000 });
}

/** Get the text of the latest activity entry in the strip. */
export async function getLatestActivity(page: Page): Promise<string> {
  const activityText = page.locator('[data-testid="activity-strip-text"]');
  const text = await activityText.textContent();
  return text || '';
}

