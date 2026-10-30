import { useEffect, useRef } from 'react';
import { useGameStore } from '../stores/gameStore';
import { getRoom } from '../lib/api';
import { buildWsUrl } from '../lib/wsUrl';
import { reconnectDelayMs } from '../lib/reconnect';
import type { RoomEvent } from '../types/game';

/** API Gateway closes idle WebSockets after 10 minutes. */
export const PING_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Keeps a WebSocket open for a room and applies every pushed snapshot to the store.
 * Push is best-effort: correctness comes from resyncing (GET) on every (re)connect,
 * when the page becomes visible again, and on `stale` events.
 */
export const useRoomEvents = (
  roomCode: string | null | undefined,
  playerId?: string | null,
  options?: { onRejoined?: () => void },
) => {
  const playerIdRef = useRef(playerId);
  const onRejoinedRef = useRef(options?.onRejoined);

  useEffect(() => {
    playerIdRef.current = playerId;
    onRejoinedRef.current = options?.onRejoined;
  });

  useEffect(() => {
    if (!roomCode) return;

    const store = () => useGameStore.getState();
    let disposed = false;
    let socket: WebSocket | null = null;
    let attempt = 0;
    let hasConnected = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;

    const resync = async (afterReconnect: boolean) => {
      try {
        const snapshot = await getRoom(roomCode);
        if (disposed) return;
        store().applySnapshot(snapshot);
        if (afterReconnect) onRejoinedRef.current?.();
      } catch (err) {
        console.error('Error resyncing room:', err);
      }
    };

    const applyEvent = (evt: RoomEvent) => {
      if (evt.stale) {
        void resync(false);
        return;
      }
      store().applySnapshot(evt);
      if (evt.type === 'undoDeclined' && evt.actorPlayerId && evt.actorPlayerId !== playerIdRef.current) {
        store().setUndoDeclined(evt.actorPlayerId);
      }
    };

    const clearPing = () => {
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = null;
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, reconnectDelayMs(attempt++));
    };

    const connect = () => {
      if (disposed) return;
      const ws = new WebSocket(buildWsUrl(roomCode, playerIdRef.current));
      socket = ws;
      let closed = false;

      ws.onopen = () => {
        if (disposed || socket !== ws) return;
        attempt = 0;
        store().setConnected(true);
        clearPing();
        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ action: 'ping' }));
        }, PING_INTERVAL_MS);
        // The socket is open before the GET so nothing committed after the GET is missed.
        void resync(hasConnected);
        hasConnected = true;
      };

      ws.onmessage = (message) => {
        if (disposed || socket !== ws) return;
        try {
          applyEvent(JSON.parse(String(message.data)) as RoomEvent);
        } catch (err) {
          console.error('Ignoring malformed room event:', err);
        }
      };

      const onDown = () => {
        if (closed) return;
        closed = true;
        if (disposed || socket !== ws) return;
        clearPing();
        store().setConnected(false);
        scheduleReconnect();
      };
      ws.onclose = onDown;
      ws.onerror = onDown;
    };

    // After a phone sleeps, timers may have been frozen: reconnect now, or resync if still connected.
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || disposed) return;
      if (socket && socket.readyState === WebSocket.OPEN) {
        void resync(false);
      } else if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = null;
        connect();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    connect();

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearPing();
      const ws = socket;
      socket = null;
      ws?.close();
    };
  }, [roomCode]);
};
