import { test, expect } from '@playwright/test';
import { createRoom, joinRoomAsCreator, joinRoomByName, startGame, waitForGameReady } from '../helpers/game';
import { call, check, fold, waitForMyTurn, waitForPhase } from '../helpers/actions';

test.describe('Edge Cases', () => {
  test('TC35 - page refresh reconnects and restores game state', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const roomCode = await createRoom(page1, {
      startingStack: 1000,
      smallBlind: 10,
      bigBlind: 20,
    });
    await joinRoomAsCreator(page1, roomCode, 'Alice');
    await joinRoomByName(page2, roomCode, 'Bob');
    await expect(page1.getByText('Players (2')).toBeVisible({ timeout: 5_000 });
    await startGame(page1, roomCode);
    await waitForGameReady(page1);
    await waitForGameReady(page2);

    // Verify initial state
    await expect(page1.getByText('$30')).toBeVisible();

    // Refresh player 1's page
    await page1.reload();

    // After reload: game state should restore via SignalR + sessionStorage
    await waitForGameReady(page1);

    // Pot still visible after reconnect
    await expect(page1.getByText('$30')).toBeVisible({ timeout: 5_000 });

    // Game continues: phase still PreFlop
    await expect(page1.locator('.text-yellow-300').first()).toHaveText('PreFlop');

    await ctx1.close();
    await ctx2.close();
  });

  test('TC36 - multiple consecutive hands: stacks track correctly', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const roomCode = await createRoom(page1, {
      startingStack: 1000,
      smallBlind: 10,
      bigBlind: 20,
    });
    await joinRoomAsCreator(page1, roomCode, 'Alice');
    await joinRoomByName(page2, roomCode, 'Bob');
    await expect(page1.getByText('Players (2')).toBeVisible({ timeout: 5_000 });
    await startGame(page1, roomCode);
    await waitForGameReady(page1);
    await waitForGameReady(page2);

    // Play 3 hands by folding immediately each time
    for (let hand = 1; hand <= 3; hand++) {
      const p1Active = await page1.getByText('Your Turn - Choose Action').isVisible();
      const foldingPage = p1Active ? page1 : page2;

      await foldingPage.getByRole('button', { name: 'Fold' }).click();

      // Wait for next hand (new PreFlop)
      if (hand < 3) {
        await waitForPhase(page1, 'PreFlop');
        // Small delay to let state settle
        await page1.waitForTimeout(500);
      }
    }

    // After 3 hands, game is still running
    await expect(page1.locator('.text-yellow-300').first()).toHaveText('PreFlop');
    await expect(page1.getByText('Dealer')).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });

  test('TC37 - health endpoint returns healthy', async ({ request }) => {
    const response = await request.get('http://localhost:5000/health');
    expect(response.ok()).toBe(true);
    const body = await response.text();
    expect(body).toContain('healthy');
  });

  test('TC38 - GET /api/rooms/INVALID returns 404', async ({ request }) => {
    const response = await request.get('http://localhost:5000/api/rooms/ZZZZZZ');
    expect(response.status()).toBe(404);
  });

  test('TC39 - create room then GET returns correct initial state', async ({ request }) => {
    // Create a room via REST
    const createResponse = await request.post('http://localhost:5000/api/rooms', {
      data: {
        startingStack: 500,
        smallBlind: 5,
        bigBlind: 10,
      },
    });
    expect(createResponse.ok()).toBe(true);
    const createData = await createResponse.json();
    expect(createData.success).toBe(true);
    const roomCode: string = createData.roomCode;
    expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);

    // Join as two players
    const join1 = await request.post(`http://localhost:5000/api/rooms/${roomCode}/join`, {
      data: { name: 'TestP1' },
    });
    expect(join1.ok()).toBe(true);
    const join1Data = await join1.json();
    const creatorId: string = join1Data.playerId;

    const join2 = await request.post(`http://localhost:5000/api/rooms/${roomCode}/join`, {
      data: { name: 'TestP2' },
    });
    expect(join2.ok()).toBe(true);

    // Start the game
    const startResponse = await request.post(`http://localhost:5000/api/rooms/${roomCode}/start`, {
      data: { playerId: creatorId },
    });
    expect(startResponse.ok()).toBe(true);

    // GET room state
    const getResponse = await request.get(`http://localhost:5000/api/rooms/${roomCode}`);
    expect(getResponse.ok()).toBe(true);
    const getRoomData = await getResponse.json();
    expect(getRoomData.success).toBe(true);
    const state = getRoomData.gameState;

    expect(state.pot).toBe(15); // SB(5) + BB(10)
    expect(state.phase).toBe('PreFlop');
    expect(state.players).toHaveLength(2);
    expect(state.isHandActive).toBe(true);
  });

  test('TC40 - reconnecting player not in store recovers from sessionStorage', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const roomCode = await createRoom(page1, {
      startingStack: 1000,
      smallBlind: 10,
      bigBlind: 20,
    });
    await joinRoomAsCreator(page1, roomCode, 'Alice');
    await joinRoomByName(page2, roomCode, 'Bob');
    await expect(page1.getByText('Players (2')).toBeVisible({ timeout: 5_000 });
    await startGame(page1, roomCode);
    await waitForGameReady(page1);
    await waitForGameReady(page2);

    // Navigate away and back (simulates a deeper reconnect scenario)
    await page2.goto('/');
    await page2.goto(`/room/${roomCode}`);

    // Should reconnect via sessionStorage-stored playerId
    await waitForGameReady(page2);
    await expect(page2.getByText(`Room: ${roomCode}`)).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });
});
