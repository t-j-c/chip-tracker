import { execSync } from 'child_process';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../..');

async function globalTeardown() {
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
