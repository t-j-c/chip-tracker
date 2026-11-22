import { useEffect, useRef } from 'react';
import { useGameStore } from '../stores/gameStore';
import { getRoom } from '../lib/api';
import { buildWsUrl } from '../lib/wsUrl';
import { reconnectDelayMs } from '../lib/reconnect';
import type { RoomEvent } from '../types/game';

export const HEARTBEAT_INTERVAL_MS = 25 * 1000;
export const PONG_TIMEOUT_MS = 5 * 1000;
export const CONNECT_TIMEOUT_MS = 8 * 1000;

/** Safety-net resync while visible, in case a push was missed on a socket that looks open. */
export const RESYNC_INTERVAL_MS = 30 * 1000;

/**
 * Keeps a WebSocket open for a room and applies every pushed snapshot to the store.
 * Push is best-effort: correctness comes from resyncing (GET) on every (re)connect,
 * when the page becomes visible again, on `stale` events, and periodically while visible.
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
    let connectedAt = 0;
    let lastMessageAt: number | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let pongTimer: ReturnType<typeof setTimeout> | null = null;
    let connectTimer: ReturnType<typeof setTimeout> | null = null;

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

    const clearPong = () => {
      if (pongTimer !== null) clearTimeout(pongTimer);
      pongTimer = null;
    };

    const clearSocketTimers = () => {
      if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
      if (connectTimer !== null) clearTimeout(connectTimer);
      heartbeatTimer = null;
      connectTimer = null;
      clearPong();
    };

    const clearReconnect = () => {
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      reconnectTimer = null;
    };

    const releaseSocket = (ws: WebSocket) => {
      if (socket !== ws) return;
      socket = null;
      clearSocketTimers();
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      if (ws.readyState !== WebSocket.CLOSED) ws.close();
      store().setConnected(false);
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer !== null) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, reconnectDelayMs(attempt++));
    };

    const connect = () => {
      if (disposed || socket) return;
      let ws: WebSocket;
      try {
        ws = new WebSocket(buildWsUrl(roomCode, playerIdRef.current));
      } catch (err) {
        console.error('Error connecting to room:', err);
        scheduleReconnect();
        return;
      }
      socket = ws;
      connectedAt = Date.now();
      lastMessageAt = null;

      const onDown = () => {
        if (disposed || socket !== ws) return;
        releaseSocket(ws);
        scheduleReconnect();
      };

      const probe = () => {
        if (disposed || socket !== ws || ws.readyState !== WebSocket.OPEN || pongTimer !== null) return;
        const previousMessageAt = lastMessageAt;
        pongTimer = setTimeout(() => {
          pongTimer = null;
          if (lastMessageAt === previousMessageAt && document.visibilityState === 'visible') onDown();
        }, PONG_TIMEOUT_MS);
        try {
          ws.send(JSON.stringify({ action: 'ping' }));
        } catch (err) {
          console.error('Error sending room heartbeat:', err);
          onDown();
        }
      };

      connectTimer = setTimeout(onDown, CONNECT_TIMEOUT_MS);

      ws.onopen = () => {
        if (disposed || socket !== ws) return;
        if (connectTimer !== null) clearTimeout(connectTimer);
        connectTimer = null;
        attempt = 0;
        store().setConnected(true);
        // Pings keep API Gateway's 10-minute idle timeout at bay even while hidden; liveness
        // is only enforced while visible because background timers are unreliable.
        heartbeatTimer = setInterval(() => {
          if (document.visibilityState === 'visible') {
            probe();
          } else if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ action: 'ping' }));
            } catch (err) {
              console.error('Error sending room keep-alive:', err);
            }
          }
        }, HEARTBEAT_INTERVAL_MS);
        // The socket is open before the GET so nothing committed after the GET is missed.
        void resync(hasConnected);
        hasConnected = true;
      };

      ws.onmessage = (message) => {
        if (disposed || socket !== ws) return;
        lastMessageAt = Date.now();
        clearPong();
        try {
          const evt: unknown = JSON.parse(String(message.data));
          if (typeof evt !== 'object' || evt === null || !('type' in evt)) {
            console.error('Ignoring malformed room event:', evt);
            return;
          }
          if (evt.type !== 'pong') applyEvent(evt as RoomEvent);
        } catch (err) {
          console.error('Ignoring malformed room event:', err);
        }
      };

      ws.onclose = onDown;
      ws.onerror = onDown;

      // Expose this connection's probe to the lifecycle listeners below.
      probeSocket = probe;
    };

    let probeSocket: (() => void) | null = null;
    const onResume = () => {
      if (disposed) return;
      if (document.visibilityState !== 'visible') {
        clearPong();
        return;
      }
      void resync(false);
      if (socket?.readyState === WebSocket.OPEN) {
        probeSocket?.();
      } else if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING
        || (socket.readyState === WebSocket.CONNECTING && Date.now() - connectedAt >= CONNECT_TIMEOUT_MS)) {
        clearReconnect();
        attempt = 0;
        if (socket) releaseSocket(socket);
        connect();
      }
    };
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('pageshow', onResume);
    window.addEventListener('online', onResume);

    const resyncTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && !disposed) void resync(false);
    }, RESYNC_INTERVAL_MS);

    connect();

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('pageshow', onResume);
      window.removeEventListener('online', onResume);
      clearInterval(resyncTimer);
      clearReconnect();
      clearSocketTimers();
      const ws = socket;
      if (ws) releaseSocket(ws);
    };
  }, [roomCode]);
};
