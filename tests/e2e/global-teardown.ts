import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../..');
const LOGS_DIR = path.join(__dirname, 'test-results');

async function globalTeardown() {
  // Dump container logs before removing containers so they can be inspected later.
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    const logPath = path.join(LOGS_DIR, 'docker-compose.log');
    const logs = execSync('docker compose logs --no-color', { cwd: REPO_ROOT });
    fs.writeFileSync(logPath, logs);
    console.log(`\n[E2E teardown] Container logs saved to ${logPath}`);
  } catch (err) {
    console.warn('[E2E teardown] Warning: could not capture container logs:', err);
  }

  console.log('\n[E2E teardown] Stopping Docker Compose stack...');
  try {
    execSync('docker compose down -v', {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    });
    console.log('[E2E teardown] Stack stopped.');
  } catch (err) {
    console.error('[E2E teardown] Warning: docker compose down failed:', err);
  }
}

export default globalTeardown;
