import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const h = vi.hoisted(() => {
  const state = { value: 'Disconnected' };
  const handlers: Record<string, (...a: unknown[]) => void> = {};
  const conn = {
    get state() {
      return state.value;
    },
    on: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(async () => {}),
    invoke: vi.fn(async () => {}),
    onreconnected: vi.fn((cb: () => void) => (handlers.reconnected = cb)),
    onreconnecting: vi.fn((cb: () => void) => (handlers.reconnecting = cb)),
    onclose: vi.fn((cb: () => void) => (handlers.close = cb)),
  };
  return { state, handlers, conn };
});

vi.mock('@microsoft/signalr', () => ({
  HubConnectionState: { Disconnected: 'Disconnected', Connected: 'Connected' },
  HubConnectionBuilder: class {
    withUrl() { return this; }
    withAutomaticReconnect() { return this; }
    build() { return h.conn; }
  },
}));

import { useSignalR } from './useSignalR';

const connectOk = () => {
  h.conn.start.mockImplementation(async () => {
    h.state.value = 'Connected';
  });
};

describe('useSignalR reconnect handling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.state.value = 'Disconnected';
    h.conn.start.mockReset();
    h.conn.invoke.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('joins the room once connected', async () => {
    connectOk();
    const { result } = renderHook(() => useSignalR());
    await act(async () => { await result.current.joinRoom('ABC123', 'p1'); });
    expect(h.conn.invoke).toHaveBeenCalledWith('JoinRoom', 'ABC123', 'p1');
  });

  it('rejoins the room after an automatic reconnect', async () => {
    connectOk();
    const { result } = renderHook(() => useSignalR());
    await act(async () => { await result.current.joinRoom('ABC123', 'p1'); });
    h.conn.invoke.mockClear();

    await act(async () => { h.handlers.reconnected(); });

    expect(h.conn.invoke).toHaveBeenCalledWith('JoinRoom', 'ABC123', 'p1');
  });

  it('retries the initial connect and then joins', async () => {
    h.conn.start.mockRejectedValueOnce(new Error('down')).mockImplementation(async () => {
      h.state.value = 'Connected';
    });
    const { result } = renderHook(() => useSignalR());
    await act(async () => { await result.current.joinRoom('ABC123', 'p1'); });
    expect(h.conn.invoke).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

    expect(h.conn.start).toHaveBeenCalledTimes(2);
    expect(h.conn.invoke).toHaveBeenCalledWith('JoinRoom', 'ABC123', 'p1');
  });

  it('restarts and calls onRejoined when the connection closes', async () => {
    connectOk();
    const onRejoined = vi.fn();
    const { result } = renderHook(() => useSignalR({ onRejoined }));
    await act(async () => { await result.current.joinRoom('ABC123', 'p1'); });
    expect(onRejoined).not.toHaveBeenCalled();
    h.state.value = 'Disconnected';
    h.conn.start.mockClear();

    await act(async () => { h.handlers.close(); });

    expect(h.conn.start).toHaveBeenCalledTimes(1);
    expect(onRejoined).toHaveBeenCalledTimes(1);
  });

  it('reconnects immediately when the page becomes visible while disconnected', async () => {
    h.conn.start.mockRejectedValue(new Error('down'));
    renderHook(() => useSignalR());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(h.conn.start).toHaveBeenCalledTimes(1);

    connectOk();
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(h.conn.start).toHaveBeenCalledTimes(2);
  });
});
