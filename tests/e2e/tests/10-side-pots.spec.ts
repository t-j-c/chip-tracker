import { test, expect, Browser, Page } from '@playwright/test';
import { createRoom, joinRoomAsCreator, joinRoomByName, startGame, waitForGameReady } from '../helpers/game';
import {
  fold,
  call,
  check,
  raise,
  allIn,
  waitForMyTurn,
  waitForPhase,
  waitForShowdown,
  selectShowdownWinner,
} from '../helpers/actions';

/** Reads the numeric stack shown on a player's own panel (self variant). */
async function getSelfStack(page: Page): Promise<number> {
  const text = await page.locator('[data-testid="self-player-panel"]').textContent();
  const match = (text ?? '').match(/Stack:\s*\$([\d,]+)/);
  return parseInt((match?.[1] ?? '0').replace(/,/g, ''), 10);
}

/**
 * Wait for the showdown dialog to appear when the hand has side pots (the multi-pot stepper
 * shows different subtext than the single-pot dialog, so the shared waitForShowdown helper
 * doesn't apply here).
 */
async function waitForSidePotStep(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Showdown' })).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('[data-testid="pot-step-label"]')).toBeVisible();
}

/**
 * Three-handed setup that deterministically produces unequal stacks (via a hand 1 raise/
 * call/fold resolved in Bob's favor) and then drives hand 2 into a three-way all-in at
 * different stack depths, producing a main pot (all three eligible) and a side pot
 * (only the two bigger stacks eligible). See session plan for the full chip-math derivation.
 *
 * Page/name mapping: page1=Alice (creator, seat 0), page2=Bob (seat 1), page3=Cara (seat 2).
 */
async function setupThreeHandedSidePot(browser: Browser) {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const ctx3 = await browser.newContext();
  const page1 = await ctx1.newPage();
  const page2 = await ctx2.newPage();
  const page3 = await ctx3.newPage();

  const roomCode = await createRoom(page1, { startingStack: 1000, smallBlind: 10, bigBlind: 20 });
  await joinRoomAsCreator(page1, roomCode, 'Alice');
  await joinRoomByName(page2, roomCode, 'Bob');
  await joinRoomByName(page3, roomCode, 'Cara');
  await expect(page1.getByText('3 of 9 players')).toBeVisible({ timeout: 5_000 });
  await startGame(page1, roomCode);
  await waitForGameReady(page1);
  await waitForGameReady(page2);
  await waitForGameReady(page3);

  // Hand 1 (dealer = Alice): Alice (UTG/dealer) raises, Bob (SB) calls, Cara (BB) folds.
  // Street auto-advances since the two remaining players are matched. Check down to showdown.
  await waitForMyTurn(page1);
  await raise(page1, 300);
  await waitForMyTurn(page2);
  await call(page2);
  await fold(page3);

  await waitForPhase(page1, 'Flop');
  for (let i = 0; i < 3; i++) {
    await waitForMyTurn(page2);
    await check(page2);
    await waitForMyTurn(page1);
    await check(page1);
  }

  await waitForShowdown(page1);
  await selectShowdownWinner(page1, 'Bob'); // Bob: 700 -> 1320

  // Hand 2 (dealer rotates to Bob): Bob (UTG/dealer, 1320) goes all-in, Cara (SB, 970 left)
  // and Alice (BB, 680 left) both call and are forced all-in for less - a genuine side pot.
  await waitForPhase(page1, 'PreFlop');
  await waitForMyTurn(page2);
  await allIn(page2);
  await waitForMyTurn(page3);
  await call(page3);
  await waitForMyTurn(page1);
  await call(page1);

  return { page1, page2, page3, ctx1, ctx2, ctx3, roomCode };
}

test.describe('Side Pots (3+ players, unequal all-ins)', () => {
  test('TC45 - three-way all-in at different stack depths creates a main pot and a side pot with correct eligibility', async ({ browser }) => {
    const { page1, page2, page3, ctx1, ctx2, ctx3 } = await setupThreeHandedSidePot(browser);

    await waitForSidePotStep(page1);
    await waitForSidePotStep(page2);
    await waitForSidePotStep(page3);

    // Step 1 of 2: main pot - all three players contributed enough to be eligible.
    await expect(page1.locator('[data-testid="pot-step-label"]')).toContainText('1 of 2');
    await expect(page1.getByRole('button', { name: 'Alice wins' })).toBeVisible();
    await expect(page1.getByRole('button', { name: 'Bob wins' })).toBeVisible();
    await expect(page1.getByRole('button', { name: 'Cara wins' })).toBeVisible();

    // Award the main pot to Alice (the shortest stack this hand).
    await selectShowdownWinner(page1, 'Alice');

    // Step 2 of 2: side pot - only Bob and Cara (the two deeper stacks) are eligible.
    await expect(page1.locator('[data-testid="pot-step-label"]')).toContainText('2 of 2');
    await expect(page1.getByRole('button', { name: 'Alice wins' })).not.toBeVisible();
    await expect(page1.getByRole('button', { name: 'Bob wins' })).toBeVisible();
    await expect(page1.getByRole('button', { name: 'Cara wins' })).toBeVisible();

    // Award the side pot to Bob (a covering player).
    await selectShowdownWinner(page1, 'Bob');

    // New hand should start on every client once both pots are resolved.
    await waitForPhase(page1, 'PreFlop');
    await waitForPhase(page2, 'PreFlop');
    await waitForPhase(page3, 'PreFlop');

    await ctx1.close();
    await ctx2.close();
    await ctx3.close();
  });

  test('TC46 - awarding main pot and side pot to different winners distributes chips correctly and conserves total', async ({ browser }) => {
    const { page1, page2, page3, ctx1, ctx2, ctx3 } = await setupThreeHandedSidePot(browser);

    await waitForSidePotStep(page1);
    await selectShowdownWinner(page1, 'Alice'); // main pot (2100) -> Alice
    await selectShowdownWinner(page1, 'Bob');   // side pot (560) -> Bob

    // Cara won nothing this hand and busted to zero, so she must decide to rebuy or cash out
    // before a new hand can start - no blinds are posted while that decision is pending.
    await expect(page3.locator('[data-testid="rebuy-dialog"]')).toBeVisible({ timeout: 5_000 });

    // Expected (see chip-math derivation in setupThreeHandedSidePot):
    // Alice: 2100 main pot (main pot recipient, unaffected by Cara's bust)
    // Bob: 340 refunded uncalled excess + 560 side pot = 900
    // Cara: 0 (won nothing), now awaiting a rebuy decision
    await expect(async () => {
      expect(await getSelfStack(page1)).toBe(2100);
    }).toPass({ timeout: 5_000 });
    await expect(async () => {
      expect(await getSelfStack(page2)).toBe(900);
    }).toPass({ timeout: 5_000 });
    await expect(async () => {
      expect(await getSelfStack(page3)).toBe(0);
    }).toPass({ timeout: 5_000 });

    // Total chips conserved across the whole scenario (3 players x 1000 starting stack).
    // No blinds have been posted for a new hand yet, so the pot is empty.
    await expect(page1.locator('[data-testid="pot-amount"]')).toHaveText('$0', { timeout: 5_000 });
    expect(2100 + 900 + 0).toBe(3000);

    await ctx1.close();
    await ctx2.close();
    await ctx3.close();
  });
});
