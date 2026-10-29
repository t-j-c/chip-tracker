import { describe, it, expect } from 'vitest';
import { infiniteRetryPolicy, reconnectDelayMs } from './reconnect';

describe('reconnect policy', () => {
  it('retries immediately first, then backs off', () => {
    expect(reconnectDelayMs(0)).toBe(0);
    expect(reconnectDelayMs(1)).toBeGreaterThanOrEqual(800);
    expect(reconnectDelayMs(1)).toBeLessThanOrEqual(1200);
  });

  it('caps the delay at about 10 seconds and never gives up', () => {
    for (const attempt of [5, 20, 500, 100000]) {
      const delay = infiniteRetryPolicy.nextRetryDelayInMilliseconds({
        previousRetryCount: attempt,
        elapsedMilliseconds: 10 ** 9,
        retryReason: new Error('x'),
      });
      expect(delay).not.toBeNull();
      expect(delay!).toBeLessThanOrEqual(12_000);
      expect(delay!).toBeGreaterThanOrEqual(8_000);
    }
  });
});
