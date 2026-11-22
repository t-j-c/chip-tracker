import { useEffect } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { unlockAudio } from '../lib/sound';

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const reduceMotion = useSettingsStore(s => s.reduceMotion);

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(reduceMotion);
  }, [reduceMotion]);

  useEffect(() => {
    window.addEventListener('pointerdown', unlockAudio);
    return () => window.removeEventListener('pointerdown', unlockAudio);
  }, []);

  return <div className="min-h-[100dvh] text-ink">{children}</div>;
}
