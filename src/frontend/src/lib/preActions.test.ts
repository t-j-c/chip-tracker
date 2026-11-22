import { describe, it, expect } from 'vitest';
import { resolvePreAction } from './preActions';

describe('resolvePreAction', () => {
  it('Check/Fold checks when free and folds facing a bet', () => {
    expect(resolvePreAction('checkFold', true)).toBe('Check');
    expect(resolvePreAction('checkFold', false)).toBe('Fold');
  });

  it('Check only fires when checking is still possible', () => {
    expect(resolvePreAction('check', true)).toBe('Check');
    expect(resolvePreAction('check', false)).toBeNull();
  });

  it('Call Any checks when free and calls facing a bet', () => {
    expect(resolvePreAction('callAny', true)).toBe('Check');
    expect(resolvePreAction('callAny', false)).toBe('Call');
  });
});
