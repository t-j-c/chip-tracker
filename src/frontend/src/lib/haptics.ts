import { useSettingsStore } from '../stores/settingsStore';

export const HAPTICS: Record<'tick' | 'snap' | 'action' | 'turn' | 'win' | 'error', number | number[]> = {
  tick: 3,
  snap: 10,
  action: 15,
  turn: [40, 60, 40],
  win: [30, 40, 80],
  error: [60, 40, 60],
};

export function vibrate(pattern: number | number[]): void {
  if (!useSettingsStore.getState().hapticsOn) return;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers throw without a prior user gesture.
  }
}
