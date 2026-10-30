// Post-deploy smoke test. No dependencies; needs Node 22+ (global WebSocket).
// Usage: node tests/smoke/smoke.mjs https://deal-me-in.com
const base = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? '').replace(/\/$/, '');
if (!/^https?:\/\//.test(base)) {
  console.error('Usage: node smoke.mjs <base-url>');
  process.exit(2);
}

const wsBase = base.replace(/^http/, 'ws');
let failed = false;

async function step(name, fn) {
  const started = Date.now();
  try {
    await fn();
    console.log(`PASS ${name} (${Date.now() - started} ms)`);
  } catch (err) {
    failed = true;
    console.error(`FAIL ${name}: ${err instanceof Error ? err.message : err}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function json(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // Non-JSON bodies are reported by the callers' assertions.
  }
  return { status: res.status, contentType: res.headers.get('content-type') ?? '', data, text };
}

// Resolves with the first frame of the given type, or rejects on timeout or close.
function waitForFrame(ws, type, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no "${type}" frame within ${timeoutMs} ms`)), timeoutMs);
    ws.addEventListener('message', (event) => {
      let frame;
      try {
        frame = JSON.parse(event.data);
      } catch {
        return;
      }
      if (frame.type === type) {
        clearTimeout(timer);
        resolve(frame);
      }
    });
    ws.addEventListener('close', () => {
      clearTimeout(timer);
      reject(new Error('socket closed before frame arrived'));
    });
  });
}

function openSocket(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => reject(new Error(`socket did not open within ${timeoutMs} ms`)), timeoutMs);
    ws.addEventListener('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('socket error while connecting'));
    });
  });
}

await step('GET /api/health returns 200', async () => {
  const res = await fetch(`${base}/api/health`);
  assert(res.status === 200, `status ${res.status}`);
});

let roomCode;
let hostId;

await step('create room and join two players', async () => {
  const created = await json('POST', '/api/rooms', { startingStack: 1000, smallBlind: 5, bigBlind: 10 });
  assert(created.status === 200 && created.data?.roomCode, `create failed: ${created.status} ${created.text}`);
  roomCode = created.data.roomCode;

  const host = await json('POST', `/api/rooms/${roomCode}/join`, { name: 'Smoke Host' });
  assert(host.status === 200 && host.data?.playerId, `host join failed: ${host.status} ${host.text}`);
  hostId = host.data.playerId;

  const guest = await json('POST', `/api/rooms/${roomCode}/join`, { name: 'Smoke Guest' });
  assert(guest.status === 200, `guest join failed: ${guest.status} ${guest.text}`);
});

await step('WebSocket receives gameStarted after start', async () => {
  assert(roomCode, 'no room from previous step');
  const ws = await openSocket(`${wsBase}/ws?room=${roomCode}`, 10_000);
  try {
    const frame = waitForFrame(ws, 'gameStarted', 10_000);
    // Avoid an unhandled rejection if the start request throws before the frame is awaited.
    frame.catch(() => {});
    const started = await json('POST', `/api/rooms/${roomCode}/start`, { playerId: hostId });
    assert(started.status === 200, `start failed: ${started.status} ${started.text}`);
    const received = await frame;
    assert(received.roomCode === roomCode, `frame for wrong room: ${received.roomCode}`);
  } finally {
    ws.close();
  }
});

await step('SPA deep link returns HTML', async () => {
  const res = await fetch(`${base}/join?room=ABC123`);
  const type = res.headers.get('content-type') ?? '';
  assert(res.status === 200, `status ${res.status}`);
  assert(type.includes('text/html'), `content-type ${type}`);
});

await step('unknown room returns JSON 404', async () => {
  const res = await json('GET', '/api/rooms/ZZZZZZ');
  assert(res.status === 404, `status ${res.status}`);
  assert(res.contentType.includes('json'), `content-type ${res.contentType} (rewritten to HTML?)`);
});

if (failed) {
  console.error('\nSmoke test FAILED');
  process.exit(1);
}
console.log('\nSmoke test passed');
