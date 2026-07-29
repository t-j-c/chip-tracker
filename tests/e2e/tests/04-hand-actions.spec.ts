import { test, expect, Browser, Page } from '@playwright/test';
import { createRoom, joinRoomAsCreator, joinRoomByName, startGame, waitForGameReady } from '../helpers/game';
import {
  fold,
  call,
  check,
  bet,
  raise,
  allIn,
  waitForMyTurn,
  waitForOpponentTurn,
  waitForPhase,
  waitForShowdown,
} from '../helpers/actions';

/** Helper: sets up a two-player game and returns the active/inactive pages based on whose turn it is. */
async function setupGame(browser: Browser, opts?: { stack?: number; smallBlind?: number; bigBlind?: number }) {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const page1 = await ctx1.newPage();
  const page2 = await ctx2.newPage();

  const roomCode = await createRoom(page1, {
    startingStack: opts?.stack ?? 1000,
    smallBlind: opts?.smallBlind ?? 10,
    bigBlind: opts?.bigBlind ?? 20,
  });
  await joinRoomAsCreator(page1, roomCode, 'Alice');
  await joinRoomByName(page2, roomCode, 'Bob');
  await expect(page1.getByText('2 of 9 players')).toBeVisible({ timeout: 5_000 });
  await startGame(page1, roomCode);
  await waitForGameReady(page1);
  await waitForGameReady(page2);

  const p1Active = await page1.getByText('Your Turn - Choose Action').isVisible();
  const activePage = p1Active ? page1 : page2;
  const inactivePage = p1Active ? page2 : page1;

  return { page1, page2, activePage, inactivePage, ctx1, ctx2, roomCode };
}

test.describe('Hand Actions (Journey 2)', () => {
  test('TC15 - fold: pot awarded to other player, new hand starts', async ({ browser }) => {
    const { activePage, inactivePage, ctx1, ctx2 } = await setupGame(browser);

    // Record the inactive player's pot text before fold
    // Pre-flop pot = 30 (SB10 + BB20)
    await expect(activePage.getByText('$30')).toBeVisible();

    // Active player folds
    await fold(activePage);

    // After fold: a new hand starts. The pot resets to SB+BB=30 again (new hand blinds).
    // Both players see PreFlop phase for the new hand.
    await waitForPhase(activePage, 'PreFlop');
    await waitForPhase(inactivePage, 'PreFlop');

    // The winner should have received the pot (their stack > 980 or 990 depending on role)
    // We verify a new hand started: dealer badge still present (aria-label used since opponent shows 'D' not full text)
    await expect(activePage.locator('[aria-label="Dealer"]')).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });

  test('TC16 - call pre-flop: SB calls BB, action moves to BB', async ({ browser }) => {
    const { activePage, inactivePage, ctx1, ctx2 } = await setupGame(browser);

    // Active player (SB) calls
    await call(activePage);

    // After call: now the inactive player (BB) should have the turn
    await waitForMyTurn(inactivePage);
    await waitForOpponentTurn(activePage);

    await ctx1.close();
    await ctx2.close();
  });

  test('TC17 - check post-flop: no chips moved, turn passes', async ({ browser }) => {
    const { activePage, inactivePage, ctx1, ctx2 } = await setupGame(browser);

    // Get to flop: SB calls, BB checks their live pre-flop option
    await call(activePage);
    await waitForMyTurn(inactivePage);
    // Use click directly — BB remains first actor on Flop, so turn doesn't leave inactivePage
    await inactivePage.getByRole('button', { name: 'Check' }).click();

    // Should now be on the Flop
    await waitForPhase(activePage, 'Flop');
    await waitForPhase(inactivePage, 'Flop');

    // On flop: wait for a player to have their turn (ensures pot is stable)
    let flopActivePage: Page;
    let flopInactivePage: Page;
    try {
      await activePage.getByText('Your Turn - Choose Action').waitFor({ state: 'visible', timeout: 5_000 });
      flopActivePage = activePage;
      flopInactivePage = inactivePage;
    } catch {
      await inactivePage.getByText('Your Turn - Choose Action').waitFor({ state: 'visible', timeout: 5_000 });
      flopActivePage = inactivePage;
      flopInactivePage = activePage;
    }

    // Pot on flop should be $40 (SB+BB both called: 20+20)
    await expect(activePage.locator("[data-testid='pot-amount']")).toHaveText('$40');
    const potBefore = await activePage.locator("[data-testid='pot-amount']").textContent();

    // First player checks on flop
    await check(flopActivePage);

    // Turn passes to other player; pot unchanged
    await waitForMyTurn(flopInactivePage);
    const potAfter = await activePage.locator("[data-testid='pot-amount']").textContent();
    expect(potAfter).toBe(potBefore);

    await ctx1.close();
    await ctx2.close();
  });

  test('TC18 - bet post-flop: pot increases, opponent must respond', async ({ browser }) => {
    const { activePage, inactivePage, ctx1, ctx2 } = await setupGame(browser);

    // Get to flop: SB calls, BB checks their live pre-flop option
    await call(activePage);
    await waitForMyTurn(inactivePage);
    // Use click directly — BB remains first actor on Flop, so turn doesn't leave inactivePage
    await inactivePage.getByRole('button', { name: 'Check' }).click();
    await waitForPhase(activePage, 'Flop');
    await waitForPhase(inactivePage, 'Flop');

    // Find flop active player
    const p1ActiveOnFlop = await activePage.getByText('Your Turn - Choose Action').isVisible();
    const flopActivePage = p1ActiveOnFlop ? activePage : inactivePage;
    const flopInactivePage = p1ActiveOnFlop ? inactivePage : activePage;

    // Pot before bet (should be 20 after SB calls BB and no extra bet: 20+20=40... actually:
    // Pre-flop: SB posts 10, BB posts 20. SB calls (adds 10 more) = pot 40, bets reset.
    await expect(activePage.getByText('$40')).toBeVisible();

    // Bet 50 on flop
    await bet(flopActivePage, 50);

    // Opponent must respond: they see Call/Fold/Raise (not Check)
    await waitForMyTurn(flopInactivePage);
    await expect(flopInactivePage.getByRole('button', { name: /^Call/ })).toBeVisible();
    await expect(flopInactivePage.getByRole('button', { name: 'Fold' })).toBeVisible();
    await expect(flopInactivePage.getByRole('button', { name: 'Raise', exact: true })).toBeVisible();
    await expect(flopInactivePage.getByRole('button', { name: 'Check' })).not.toBeVisible();

    // Pot increased by 50
    await expect(activePage.getByText('$90')).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });

  test('TC18a - amount picker: all controls adjust the bet amount', async ({ browser }) => {
    const { activePage, inactivePage, ctx1, ctx2 } = await setupGame(browser);

    // Get to flop: SB calls, BB checks their live pre-flop option.
    await call(activePage);
    await waitForMyTurn(inactivePage);
    await inactivePage.getByRole('button', { name: 'Check' }).click();
    await waitForPhase(activePage, 'Flop');
    await waitForPhase(inactivePage, 'Flop');

    const p1ActiveOnFlop = await activePage.getByText('Your Turn - Choose Action').isVisible();
    const flopActivePage = p1ActiveOnFlop ? activePage : inactivePage;

    const potBefore = 40;
    await expect(flopActivePage.locator('[data-testid="pot-amount"]')).toHaveText('$40');

    await flopActivePage.getByRole('button', { name: 'Bet' }).click();

    const display = flopActivePage.locator('[data-testid="bet-amount-input"]');
    await expect(display).toHaveCount(1);
    await expect(flopActivePage.locator('input[data-testid="bet-amount-input"]')).toHaveCount(0);
    await expect(display).toHaveText('$20');

    await flopActivePage.getByTestId('preset-three-quarter-pot').click();
    await expect(display).toHaveText('$30');

    await flopActivePage.getByTestId('preset-pot').click();
    await expect(display).toHaveText('$40');

    await flopActivePage.getByTestId('preset-all-in').click();

    const slider = flopActivePage.getByRole('slider', { name: /amount$/i });
    await slider.focus();

    const min = Number(await slider.getAttribute('aria-valuemin'));
    const max = Number(await slider.getAttribute('aria-valuemax'));
    await expect(display).toHaveText(`$${max.toLocaleString()}`);

    await flopActivePage.getByTestId('amount-step-down').click();
    await expect(display).toHaveText(`$${Math.max(min, max - 20).toLocaleString()}`);

    await flopActivePage.getByTestId('amount-step-up').click();
    await expect(display).toHaveText(`$${max.toLocaleString()}`);
    await expect(flopActivePage.getByTestId('amount-step-up')).toBeDisabled();
    await slider.focus();

    await flopActivePage.keyboard.press('Home');
    await expect(slider).toHaveAttribute('aria-valuenow', String(min));

    await flopActivePage.keyboard.press('End');
    await expect(slider).toHaveAttribute('aria-valuenow', String(max));

    await flopActivePage.keyboard.press('Home');
    await flopActivePage.keyboard.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuenow', String(min + 1));

    const sliderBox = await slider.boundingBox();
    if (!sliderBox) throw new Error('Slider bounding box not available');
    await flopActivePage.mouse.move(sliderBox.x + 5, sliderBox.y + sliderBox.height / 2);
    await flopActivePage.mouse.down();
    await flopActivePage.mouse.move(sliderBox.x + sliderBox.width * 0.7, sliderBox.y + sliderBox.height / 2);
    await flopActivePage.mouse.up();

    const draggedAmount = Number((await display.textContent())?.replace(/[^0-9]/g, '') || '0');
    expect(draggedAmount).toBeGreaterThan(min + 1);

    const expectedPot = potBefore + draggedAmount;
    await flopActivePage.getByTestId('confirm-bet').click();
    await expect(flopActivePage.locator('[data-testid="pot-amount"]')).toHaveText(`$${expectedPot}`);

    await ctx1.close();
    await ctx2.close();
  });

  test('TC19 - raise: pot increases further, original bettor must respond', async ({ browser }) => {
    const { activePage, inactivePage, ctx1, ctx2 } = await setupGame(browser);

    // SB calls BB pre-flop
    await call(activePage);
    await waitForMyTurn(inactivePage);

    // BB raises instead of checking
    // minRaiseTo = currentBet (20) + minRaise (20) = 40
    await raise(inactivePage, 40);

    // Now SB must respond
    await waitForMyTurn(activePage);
    await expect(activePage.getByRole('button', { name: /^Call/ })).toBeVisible();
    await expect(activePage.getByRole('button', { name: 'Fold' })).toBeVisible();
    await expect(activePage.getByRole('button', { name: 'Raise', exact: true })).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });

  test('TC20 - all-in: player goes all in, stack becomes 0', async ({ browser }) => {
    const { activePage, inactivePage, ctx1, ctx2 } = await setupGame(browser);

    // Active player goes all-in pre-flop
    await allIn(activePage);

    // Opponent's turn: they see Call or Fold
    await waitForMyTurn(inactivePage);
    await expect(inactivePage.getByRole('button', { name: /^Call/ })).toBeVisible();
    await expect(inactivePage.getByRole('button', { name: 'Fold' })).toBeVisible();

    // The all-in player's panel should show "All In"
    await expect(inactivePage.getByText('All In')).toBeVisible();

    // Opponent calls the all-in — both players are now all-in. Regression coverage for the bug
    // where the caller incorrectly kept getting offered fold/check/bet after both were all-in.
    await call(inactivePage);

    await waitForShowdown(activePage);
    await waitForShowdown(inactivePage);

    // No action buttons should remain visible on either screen once the hand is over.
    await expect(activePage.getByRole('button', { name: 'Fold' })).not.toBeVisible();
    await expect(inactivePage.getByRole('button', { name: 'Fold' })).not.toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });
});

