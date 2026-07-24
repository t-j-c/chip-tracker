import { execSync } from 'child_process';
import * as path from 'path';
import * as http from 'http';

const REPO_ROOT = path.resolve(__dirname, '../..');
const BACKEND_HEALTH = 'http://localhost:5000/health';
const FRONTEND_URL = 'http://localhost:3000';
const STARTUP_TIMEOUT_MS = 180_000;

function poll(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    function attempt() {
      const req = http.get(url, (res: http.IncomingMessage) => {
        if (res.statusCode && res.statusCode < 500) {
          resolve();
        } else if (Date.now() < deadline) {
          setTimeout(attempt, 2000);
        } else {
          reject(new Error(`Timed out polling ${url} (last status: ${res.statusCode})`));
        }
      });
      req.on('error', () => {
        if (Date.now() < deadline) {
          setTimeout(attempt, 2000);
        } else {
          reject(new Error(`Timed out polling ${url}`));
        }
      });
      req.end();
    }
    attempt();
  });
}

async function globalSetup() {
  console.log('\n[E2E setup] Starting Docker Compose stack...');

  try {
    execSync('docker compose up -d --build', {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    });
  } catch (err) {
    throw new Error(`Failed to start Docker Compose: ${err}`);
  }

  console.log('[E2E setup] Waiting for backend health check...');
  await poll(BACKEND_HEALTH, STARTUP_TIMEOUT_MS);
  console.log('[E2E setup] Backend healthy.');

  console.log('[E2E setup] Waiting for frontend...');
  await poll(FRONTEND_URL, 60_000);
  console.log('[E2E setup] Frontend ready. Stack is up.');
}

export default globalSetup;
