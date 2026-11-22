import { useSettingsStore } from '../stores/settingsStore';

export function prefersReducedMotion(): boolean {
  if (useSettingsStore.getState().reduceMotion) return true;
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
