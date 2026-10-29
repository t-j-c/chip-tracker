import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import * as path from 'path';
import { createRoom, joinRoomAsCreator, joinRoomByName, startGame, waitForGameReady } from '../helpers/game';
import { call, waitForMyTurn } from '../helpers/actions';

const REPO_ROOT = path.resolve(__dirname, '../../..');

test.describe('Reconnect (Journey: backend restart)', () => {
  test('TC60 - both clients resume receiving updates after the backend restarts', async ({ browser }) => {
    test.setTimeout(120_000);
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const roomCode = await createRoom(page1, { startingStack: 1000, smallBlind: 10, bigBlind: 20 });
    await joinRoomAsCreator(page1, roomCode, 'Alice');
    await joinRoomByName(page2, roomCode, 'Bob');
    await expect(page1.getByText('2 of 9 players')).toBeVisible({ timeout: 5_000 });
    await startGame(page1, roomCode);
    await waitForGameReady(page1);
    await waitForGameReady(page2);

    // New connections must rejoin the room group after the restart
    execSync('docker compose restart backend', { cwd: REPO_ROOT, stdio: 'inherit' });

    for (const page of [page1, page2]) {
      await expect(page.getByLabel('Reconnecting')).toBeHidden({ timeout: 60_000 });
      await expect(page.getByLabel('Connected')).toBeVisible({ timeout: 60_000 });
    }

    const p1Active = await page1.getByText('Your Turn - Choose Action').isVisible();
    const actingPage = p1Active ? page1 : page2;
    const otherPage = p1Active ? page2 : page1;

    await call(actingPage);

    // The other client only sees its turn if it rejoined the group and got the broadcast
    await waitForMyTurn(otherPage);

    await ctx1.close();
    await ctx2.close();
  });
});
