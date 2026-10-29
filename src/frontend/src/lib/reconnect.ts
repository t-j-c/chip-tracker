import type { IRetryPolicy } from '@microsoft/signalr';

const BASE_DELAYS_MS = [0, 1000, 2000, 4000, 8000];
const MAX_DELAY_MS = 10_000;

/** Delay before reconnect attempt `attempt` (0-based): quick at first, then capped at ~10 s with jitter. */
export const reconnectDelayMs = (attempt: number): number => {
  const base = BASE_DELAYS_MS[attempt] ?? MAX_DELAY_MS;
  if (base === 0) return 0;
  return Math.round(base * (0.8 + Math.random() * 0.4));
};

/** Never gives up (SignalR's default policy stops after ~42 s). */
export const infiniteRetryPolicy: IRetryPolicy = {
  nextRetryDelayInMilliseconds: (ctx) => reconnectDelayMs(ctx.previousRetryCount),
};
