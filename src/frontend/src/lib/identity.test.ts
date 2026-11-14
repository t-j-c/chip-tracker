import { describe, it, expect, beforeEach } from 'vitest';
import { recallPlayer, rememberPlayer } from './identity';

describe('player identity', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('recalls the player after the tab session is lost', () => {
    rememberPlayer('ABC123', 'p2', false);
    sessionStorage.clear();

    expect(recallPlayer('ABC123')).toEqual({ playerId: 'p2', isCreator: false });
  });

  it('prefers this tab when another tab joined as someone else', () => {
    rememberPlayer('ABC123', 'p1', true);
    localStorage.setItem('playerId_ABC123', 'p3');

    expect(recallPlayer('ABC123')).toEqual({ playerId: 'p1', isCreator: true });
  });

  it('returns null for a room this device never joined', () => {
    expect(recallPlayer('ZZZ999')).toBeNull();
  });
});
