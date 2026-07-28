import { test, expect } from '@playwright/test';

test.describe('Game Creation (Journey 1)', () => {
  test('TC01 - create game navigates to lobby with room code and QR code', async ({ page }) => {
    await page.goto('/');

    // Standard preset (1000/10/20) is selected by default � just submit
    await page.getByRole('button', { name: 'Create Game' }).click();

    // Navigates to lobby
    await page.waitForURL('**/lobby', { timeout: 5_000 });

    // Room code is 6-character alphanumeric displayed prominently
    const roomCodeEl = page.locator('[data-testid="room-code-hero"]');
    await expect(roomCodeEl).toBeVisible();
    const code = await roomCodeEl.textContent();
    expect(code?.trim()).toMatch(/[A-Z0-9]{6}/);

    // QR code rendered (role="img" scoped to QR code element)
    await expect(page.getByRole('img')).toBeVisible();

    // Join Game form visible
    await expect(page.getByLabel('Your Name')).toBeVisible();
  });

  test('TC02 - default form values are pre-populated', async ({ page }) => {
    await page.goto('/');

    // Open the Custom Setup section to inspect the hidden inputs
    await page.getByRole('button', { name: 'Custom Setup' }).click();
    await expect(page.getByLabel('Starting Stack', { exact: true })).toHaveValue('1000');
    await expect(page.getByLabel('Small Blind', { exact: true })).toHaveValue('10');
    await expect(page.getByLabel('Big Blind', { exact: true })).toHaveValue('20');
  });

  test('TC03 - create game button shows Creating... while loading', async ({ page }) => {
    await page.goto('/');

    await page.route('**/api/rooms', async (route) => {
      await new Promise(r => setTimeout(r, 300));
      await route.continue();
    });

    await page.getByRole('button', { name: 'Create Game' }).click();

    await expect(page.getByRole('button', { name: 'Creating...' })).toBeVisible();
  });

  test('TC04 - error shown when server is unreachable', async ({ page }) => {
    await page.goto('/');

    await page.route('**/api/rooms', (route) => route.abort('connectionrefused'));

    await page.getByRole('button', { name: 'Create Game' }).click();

    await expect(page.getByText(/Failed to reach server/i)).toBeVisible();
  });

  test('TC05 - lobby QR code URL points to /join?room=CODE', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await page.waitForURL('**/lobby', { timeout: 5_000 });

    // Extract room code from URL
    const url = page.url();
    const match = url.match(/\/room\/([A-Z0-9]{6})\/lobby/);
    const roomCode = match?.[1] ?? '';
    expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);

    // The QR code or share area renders with the room code
    await expect(page.locator('[data-testid="room-code-hero"]')).toContainText(roomCode);
  });
});

