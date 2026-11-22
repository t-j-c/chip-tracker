import { test, expect, BrowserContext } from '@playwright/test';
import { createRoom, joinRoomAsCreator, joinRoomByName, startGame, waitForGameReady } from '../helpers/game';
import { call, waitForMyTurn } from '../helpers/actions';

class PushChannel {
  connections = 0;
  private current: { blocked: boolean } | null = null;

  async attach(context: BrowserContext) {
    await context.routeWebSocket(/\/ws\?/, (client) => {
      const state = { blocked: false };
      this.current = state;
      this.connections++;
      const server = client.connectToServer();
      client.onMessage(message => {
        if (!state.blocked) server.send(message);
      });
      server.onMessage(message => {
        if (!state.blocked) client.send(message);
      });
    });
  }

  blackhole() {
    if (!this.current) throw new Error('No WebSocket connection to blackhole');
    this.current.blocked = true;
  }
}

test('a silent open socket recovers the turn and reconnects without a reload', async ({ browser }) => {
  test.setTimeout(60_000);
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  try {
    const push1 = new PushChannel();
    const push2 = new PushChannel();
    await push1.attach(ctx1);
    await push2.attach(ctx2);
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();
    const roomCode = await createRoom(page1);
    await joinRoomAsCreator(page1, roomCode, 'Alice');
    await joinRoomByName(page2, roomCode, 'Bob');
    await expect(page1.getByText('2 of 9 players')).toBeVisible();
    await startGame(page1, roomCode);
    await waitForGameReady(page1);
    await waitForGameReady(page2);
    await expect(page1.getByLabel('Connected')).toBeVisible();
    await expect(page2.getByLabel('Connected')).toBeVisible();

    const p1Active = await page1.getByText('Your Turn - Choose Action').isVisible();
    const actingPage = p1Active ? page1 : page2;
    const stalePage = p1Active ? page2 : page1;
    const stalePush = p1Active ? push2 : push1;
    let loads = 0;
    stalePage.on('load', () => { loads++; });
    const connectionsBefore = stalePush.connections;
    stalePush.blackhole();
    await stalePage.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await call(actingPage);
    await expect(stalePage.getByText('Waiting for your turn...')).toBeVisible();

    const started = Date.now();
    await stalePage.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => stalePush.connections, { timeout: 12_000 }).toBeGreaterThan(connectionsBefore);
    await expect(stalePage.getByLabel('Connected')).toBeVisible({ timeout: 5_000 });
    await waitForMyTurn(stalePage);
    await expect(stalePage.getByRole('button', { name: 'Check' })).toBeVisible();
    expect(Date.now() - started).toBeLessThan(20_000);
    expect(loads).toBe(0);
  } finally {
    await ctx1.close();
    await ctx2.close();
  }
});
