import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const getRoom = vi.hoisted(() => vi.fn());
vi.mock('../lib/api', () => ({ getRoom }));

import {
  useRoomEvents, HEARTBEAT_INTERVAL_MS, PONG_TIMEOUT_MS, CONNECT_TIMEOUT_MS, RESYNC_INTERVAL_MS,
} from './useRoomEvents';
import { useGameStore } from '../stores/gameStore';

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  url: string;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  drop() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  push(evt: unknown) {
    this.onmessage?.({ data: JSON.stringify(evt) });
  }
}

const last = () => MockWebSocket.instances[MockWebSocket.instances.length - 1];
const roomInfo = (name = 'Alice') => ({
  roomCode: 'ABC123',
  players: [{ playerId: 'p1', name, stack: 1000 }],
  startingStack: 1000,
  smallBlind: 10,
  bigBlind: 20,
  maxPlayers: 9,
  isGameStarted: false,
  creatorPlayerId: 'p1',
});
const snapshot = (revision: number, name?: string) => ({ revision, roomInfo: roomInfo(name), gameState: null });

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

describe('useRoomEvents', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
    getRoom.mockReset();
    getRoom.mockResolvedValue(snapshot(1));
    useGameStore.getState().reset();
    useGameStore.getState().setConnected(false);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('connects to the room socket and resyncs once it opens', async () => {
    renderHook(() => useRoomEvents('ABC123', 'p1'));
    expect(last().url).toContain('/ws?room=ABC123&playerId=p1');
    expect(getRoom).not.toHaveBeenCalled();

    await act(async () => { last().open(); });
    await flush();

    expect(useGameStore.getState().isConnected).toBe(true);
    expect(getRoom).toHaveBeenCalledWith('ABC123');
    expect(useGameStore.getState().lastRevision).toBe(1);
    expect(useGameStore.getState().lobbyPlayers).toEqual([{ playerId: 'p1', name: 'Alice' }]);
  });

  it('applies newer events and ignores stale revisions', async () => {
    renderHook(() => useRoomEvents('ABC123', 'p1'));
    await act(async () => { last().open(); });
    await flush();

    act(() => last().push({ type: 'playerJoined', roomCode: 'ABC123', ...snapshot(5, 'Newer') }));
    expect(useGameStore.getState().lobbyPlayers[0].name).toBe('Newer');

    act(() => last().push({ type: 'playerJoined', roomCode: 'ABC123', ...snapshot(4, 'Older') }));
    expect(useGameStore.getState().lobbyPlayers[0].name).toBe('Newer');
    expect(useGameStore.getState().lastRevision).toBe(5);
  });

  it('shows the declined notice to everyone except the decliner', async () => {
    renderHook(() => useRoomEvents('ABC123', 'p1'));
    await act(async () => { last().open(); });
    await flush();

    act(() => last().push({ type: 'undoDeclined', roomCode: 'ABC123', actorPlayerId: 'p1', ...snapshot(2) }));
    expect(useGameStore.getState().undoDeclined).toBeNull();

    act(() => last().push({ type: 'undoDeclined', roomCode: 'ABC123', actorPlayerId: 'p2', ...snapshot(3) }));
    expect(useGameStore.getState().undoDeclined).toBe('p2');
  });

  it('resyncs on a stale event', async () => {
    renderHook(() => useRoomEvents('ABC123', 'p1'));
    await act(async () => { last().open(); });
    await flush();
    getRoom.mockClear();
    getRoom.mockResolvedValue(snapshot(9, 'Fresh'));

    act(() => last().push({ type: 'gameStateUpdated', roomCode: 'ABC123', revision: 9, stale: true }));
    await flush();

    expect(getRoom).toHaveBeenCalledTimes(1);
    expect(useGameStore.getState().lobbyPlayers[0].name).toBe('Fresh');
  });

  it('resyncs when the page becomes visible while connected', async () => {
    renderHook(() => useRoomEvents('ABC123', 'p1'));
    await act(async () => { last().open(); });
    await flush();
    getRoom.mockClear();

    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await flush();

    expect(getRoom).toHaveBeenCalledTimes(1);
  });

  it('reconnects immediately on visibility when the socket is down', async () => {
    renderHook(() => useRoomEvents('ABC123', 'p1'));
    await act(async () => { last().open(); });
    await act(async () => { last().drop(); });
    expect(MockWebSocket.instances).toHaveLength(1);

    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });

    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it('resyncs every 30 seconds while the page is visible, but not while hidden', async () => {
    renderHook(() => useRoomEvents('ABC123', 'p1'));
    await act(async () => { last().open(); });
    await flush();
    getRoom.mockClear();

    await act(async () => { await vi.advanceTimersByTimeAsync(RESYNC_INTERVAL_MS); });
    expect(getRoom).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(RESYNC_INTERVAL_MS * 2); });
      expect(getRoom).toHaveBeenCalledTimes(1);
    } finally {
      delete (document as unknown as Record<string, unknown>).visibilityState;
    }
  });

  it('reconnects if a heartbeat receives no response', async () => {
    renderHook(() => useRoomEvents('ABC123', 'p1'));
    await act(async () => { last().open(); });
    const ws = last();

    await act(async () => { await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS); });
    expect(ws.sent).toEqual([JSON.stringify({ action: 'ping' })]);

    await act(async () => { await vi.advanceTimersByTimeAsync(PONG_TIMEOUT_MS + 1); });
    expect(ws.readyState).toBe(MockWebSocket.CLOSED);
    expect(useGameStore.getState().isConnected).toBe(false);
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it('accepts a pong or room event as liveness without applying the pong as a snapshot', async () => {
    renderHook(() => useRoomEvents('ABC123', 'p1'));
    await act(async () => { last().open(); });
    await flush();
    const ws = last();

    await act(async () => { await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS); });
    act(() => ws.push({ type: 'pong', revision: 0 }));
    expect(useGameStore.getState().lastRevision).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS); });
    expect(ws.sent).toHaveLength(2);
    act(() => ws.push({ type: 'playerJoined', roomCode: 'ABC123', ...snapshot(2, 'New') }));
    await act(async () => { await vi.advanceTimersByTimeAsync(PONG_TIMEOUT_MS + 1); });

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(useGameStore.getState().lastRevision).toBe(2);
    expect(useGameStore.getState().lobbyPlayers[0].name).toBe('New');
    expect(console.error).not.toHaveBeenCalled();
  });

  it('probes a zombie on resume, reconnects once, and resyncs on the new connection', async () => {
    renderHook(() => useRoomEvents('ABC123', 'p1'));
    await act(async () => { last().open(); });
    await flush();
    const ws = last();
    const oldClose = ws.onclose;
    getRoom.mockResolvedValue(snapshot(2, 'Fresh'));
    getRoom.mockClear();

    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(getRoom).toHaveBeenCalledTimes(1);
    expect(ws.sent).toEqual([JSON.stringify({ action: 'ping' })]);
    await act(async () => { window.dispatchEvent(new Event('online')); });
    expect(ws.sent).toHaveLength(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(PONG_TIMEOUT_MS + 1); });
    expect(MockWebSocket.instances).toHaveLength(2);
    act(() => oldClose?.());
    await flush();
    expect(MockWebSocket.instances).toHaveLength(2);

    const callsBeforeOpen = getRoom.mock.calls.length;
    await act(async () => { last().open(); });
    expect(getRoom).toHaveBeenCalledTimes(callsBeforeOpen + 1);
    expect(useGameStore.getState().lobbyPlayers[0].name).toBe('Fresh');
  });

  it('replaces a connection stuck in CONNECTING', async () => {
    renderHook(() => useRoomEvents('ABC123', 'p1'));
    const ws = last();
    await act(async () => { await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS + 1); });
    expect(ws.readyState).toBe(MockWebSocket.CLOSED);
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it('replaces an expired connecting socket immediately on resume after timers were frozen', async () => {
    renderHook(() => useRoomEvents('ABC123', 'p1'));
    const ws = last();
    vi.setSystemTime(Date.now() + CONNECT_TIMEOUT_MS);
    act(() => window.dispatchEvent(new Event('pageshow')));
    expect(ws.readyState).toBe(MockWebSocket.CLOSED);
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it.each(['pageshow', 'online'])('resyncs and probes on %s', async (event) => {
    renderHook(() => useRoomEvents('ABC123', 'p1'));
    await act(async () => { last().open(); });
    await flush();
    getRoom.mockClear();

    await act(async () => { window.dispatchEvent(new Event(event)); });
    expect(getRoom).toHaveBeenCalledTimes(1);
    expect(last().sent).toEqual([JSON.stringify({ action: 'ping' })]);
  });

  it('does not time out a heartbeat while the page is hidden', async () => {
    renderHook(() => useRoomEvents('ABC123', 'p1'));
    await act(async () => { last().open(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS); });
    const ws = last();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    try {
      act(() => document.dispatchEvent(new Event('visibilitychange')));
      await act(async () => { await vi.advanceTimersByTimeAsync(PONG_TIMEOUT_MS + 1); });
      expect(MockWebSocket.instances).toHaveLength(1);
      expect(ws.readyState).toBe(MockWebSocket.OPEN);

      // Still sends keep-alives while hidden, but never times them out.
      await act(async () => { await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS + PONG_TIMEOUT_MS); });
      expect(ws.sent).toHaveLength(2);
      expect(MockWebSocket.instances).toHaveLength(1);
    } finally {
      delete (document as unknown as Record<string, unknown>).visibilityState;
    }
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(ws.sent).toHaveLength(3);
  });

  it('reconnects with backoff, never gives up, and calls onRejoined after the resync', async () => {
    const onRejoined = vi.fn();
    renderHook(() => useRoomEvents('ABC123', 'p1', { onRejoined }));
    await act(async () => { last().open(); });
    await flush();
    expect(onRejoined).not.toHaveBeenCalled();

    await act(async () => { last().drop(); });
    expect(useGameStore.getState().isConnected).toBe(false);
    // first retry is immediate
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(MockWebSocket.instances).toHaveLength(2);

    // second attempt fails too and waits roughly a second
    await act(async () => { last().drop(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(MockWebSocket.instances).toHaveLength(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    expect(MockWebSocket.instances).toHaveLength(3);

    await act(async () => { last().open(); });
    await flush();
    expect(useGameStore.getState().isConnected).toBe(true);
    expect(onRejoined).toHaveBeenCalledTimes(1);
  });

  it('closes the socket and stops reconnecting on unmount', async () => {
    const { unmount } = renderHook(() => useRoomEvents('ABC123', 'p1'));
    await act(async () => { last().open(); });
    const ws = last();

    unmount();
    ws.drop();
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });

    expect(ws.readyState).toBe(MockWebSocket.CLOSED);
    expect(MockWebSocket.instances).toHaveLength(1);
  });
});
