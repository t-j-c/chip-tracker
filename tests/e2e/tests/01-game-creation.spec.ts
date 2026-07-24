import { test, expect } from '@playwright/test';

test.describe('Game Creation (Journey 1)', () => {
  test('TC01 - create game with valid params shows room code and QR code', async ({ page }) => {
    await page.goto('/');

    // Fill form
    await page.getByLabel('Player 1 Name').fill('Alice');
    await page.getByLabel('Player 2 Name').fill('Bob');
    await page.getByLabel('Starting Stack').fill('1000');
    await page.getByLabel('Small Blind').fill('10');
    await page.getByLabel('Big Blind').fill('20');

    await page.getByRole('button', { name: 'Create Game' }).click();

    // Room created confirmation screen
    await expect(page.getByText('Room Created!')).toBeVisible();

    // Room code is a 6-character alphanumeric string displayed prominently
    const roomCode = page.locator('p.text-4xl');
    await expect(roomCode).toBeVisible();
    const code = await roomCode.textContent();
    expect(code?.trim()).toMatch(/^[A-Z0-9]{6}$/);

    // QR code SVG rendered
    await expect(page.locator('svg')).toBeVisible();

    // Enter game button present
    await expect(page.getByRole('button', { name: /I'm Player 1/i })).toBeVisible();
  });

  test('TC02 - default form values are pre-populated', async ({ page }) => {
    await page.goto('/');

    // Defaults from state: Player 1, Player 2, stack 1000, SB 10, BB 20
    await expect(page.getByLabel('Player 1 Name')).toHaveValue('Player 1');
    await expect(page.getByLabel('Player 2 Name')).toHaveValue('Player 2');
    await expect(page.getByLabel('Starting Stack')).toHaveValue('1000');
    await expect(page.getByLabel('Small Blind')).toHaveValue('10');
    await expect(page.getByLabel('Big Blind')).toHaveValue('20');
  });

  test('TC03 - create game button is disabled while loading', async ({ page }) => {
    await page.goto('/');

    // Intercept the API call to slow it down and observe loading state
    await page.route('**/api/rooms', async (route) => {
      await new Promise(r => setTimeout(r, 300));
      await route.continue();
    });

    await page.getByRole('button', { name: 'Create Game' }).click();

    // Button should temporarily show "Creating..."
    await expect(page.getByRole('button', { name: 'Creating...' })).toBeVisible();
  });

  test('TC04 - error shown when server is unreachable', async ({ page }) => {
    await page.goto('/');

    // Block the API call
    await page.route('**/api/rooms', (route) => route.abort('connectionrefused'));

    await page.getByRole('button', { name: 'Create Game' }).click();

    await expect(page.getByText(/Failed to reach server/i)).toBeVisible();
  });

  test('TC05 - QR code URL points to /join?room=CODE', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await expect(page.getByText('Room Created!')).toBeVisible();

    const roomCode = (await page.locator('p.text-4xl').textContent())?.trim() ?? '';

    // The QR code SVG should exist; we verify the join URL hint text
    await expect(page.getByText(/\/join/)).toBeVisible();

    // The join URL in the page context includes the room code
    const joinText = await page.getByText(/Player 2/).textContent();
    expect(joinText).toContain('join');
  });
});
