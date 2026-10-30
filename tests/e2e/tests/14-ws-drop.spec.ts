import { test, expect, Browser, BrowserContext, WebSocketRoute } from '@playwright/test';
import { createRoom, joinRoomAsCreator, joinRoomByName, startGame, waitForGameReady } from '../helpers/game';
import { call, requestUndo, waitForMyTurn } from '../helpers/actions';

/**
 * Chromium's offline emulation does not close sockets that are already open, so the push channel is
 * routed through Playwright: dropping it closes the open socket and refuses reconnects until restored.
 */
class PushChannel {
  private routes: WebSocketRoute[] = [];
  private blocked = false;

  async attach(ctx: BrowserContext) {
    await ctx.routeWebSocket(/\/ws\?/, (ws) => {
      if (this.blocked) {
        void ws.close();
        return;
      }
      ws.connectToServer();
      this.routes.push(ws);
    });
  }

  async drop() {
    this.blocked = true;
    await Promise.all(this.routes.splice(0).map((r) => r.close()));
  }

  restore() {
    this.blocked = false;
  }
}

test.describe('WebSocket drop (Journey: missed pushes heal on resync)', () => {
  async function setupGame(browser: Browser) {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const push1 = new PushChannel();
    const push2 = new PushChannel();
    await push1.attach(ctx1);
    await push2.attach(ctx2);
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const roomCode = await createRoom(page1, { startingStack: 1000, smallBlind: 10, bigBlind: 20 });
    await joinRoomAsCreator(page1, roomCode, 'Alice');
    await joinRoomByName(page2, roomCode, 'Bob');
    await expect(page1.getByText('2 of 9 players')).toBeVisible({ timeout: 5_000 });
    await startGame(page1, roomCode);
    await waitForGameReady(page1);
    await waitForGameReady(page2);

    return { page1, page2, ctx1, ctx2, push1, push2 };
  }

  test('TC61 - client that lost its socket shows the latest state and pending undo prompt after reconnecting', async ({ browser }) => {
    test.setTimeout(90_000);
    const { page1, page2, ctx1, ctx2, push1, push2 } = await setupGame(browser);

    const p1Active = await page1.getByText('Your Turn - Choose Action').isVisible();
    const actingPage = p1Active ? page1 : page2;
    const offlinePage = p1Active ? page2 : page1;
    const offlineCtx = p1Active ? ctx2 : ctx1;
    const offlinePush = p1Active ? push2 : push1;

    // The client goes offline: its socket drops and nothing can reconnect
    await offlineCtx.setOffline(true);
    await offlinePush.drop();
    await expect(offlinePage.getByLabel('Reconnecting')).toBeVisible({ timeout: 15_000 });

    // While it is away: the other client acts, then requests an undo
    await expect(offlinePage.getByText('$30')).toBeVisible();
    await call(actingPage);
    await requestUndo(actingPage);
    await expect(actingPage.locator('[data-testid="undo-pending"]')).toBeVisible({ timeout: 5_000 });

    // Nothing reaches the offline client yet
    await expect(offlinePage.getByText(/wants to undo the last action/i)).toBeHidden();

    offlinePush.restore();
    await offlineCtx.setOffline(false);

    // Reconnect + resync restores the latest state and the pending undo prompt
    await expect(offlinePage.getByLabel('Connected')).toBeVisible({ timeout: 30_000 });
    await waitForMyTurn(offlinePage);
    await expect(offlinePage.getByText('$40')).toBeVisible({ timeout: 5_000 });
    await expect(offlinePage.getByText(/wants to undo the last action/i)).toBeVisible({ timeout: 5_000 });
    await expect(offlinePage.getByRole('button', { name: 'Approve' })).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });
});
