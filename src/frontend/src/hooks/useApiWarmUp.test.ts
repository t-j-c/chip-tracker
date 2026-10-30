import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useApiWarmUp } from './useApiWarmUp';

describe('useApiWarmUp', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pings /api/health once on mount', () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() => useApiWarmUp());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/health$/);
  });

  it('swallows network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(() => renderHook(() => useApiWarmUp())).not.toThrow();
    await Promise.resolve();
  });
});
