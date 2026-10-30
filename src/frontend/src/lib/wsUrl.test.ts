import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildWsUrl } from './wsUrl';

describe('buildWsUrl', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('uses VITE_WS_URL when set', () => {
    vi.stubEnv('VITE_WS_URL', 'wss://ws.example.com/ws');
    expect(buildWsUrl('ABC123', 'p1')).toBe('wss://ws.example.com/ws?room=ABC123&playerId=p1');
  });

  it('derives from VITE_API_URL by swapping the scheme', () => {
    vi.stubEnv('VITE_WS_URL', '');
    vi.stubEnv('VITE_API_URL', 'https://api.example.com/');
    expect(buildWsUrl('ABC123')).toBe('wss://api.example.com/ws?room=ABC123');
  });

  it('falls back to the page host', () => {
    vi.stubEnv('VITE_WS_URL', '');
    vi.stubEnv('VITE_API_URL', '');
    expect(buildWsUrl('ABC123', 'p1')).toBe(`ws://${window.location.host}/ws?room=ABC123&playerId=p1`);
  });
});
