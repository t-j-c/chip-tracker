import { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import type { GameState, PokerAction } from '../types/game';
import { playSound, type SoundName } from '../lib/sound';
import { HAPTICS, vibrate } from '../lib/haptics';
import { prefersReducedMotion } from '../lib/motion';

export interface ActionBubbleInfo { key: number; action: PokerAction }
export interface WinInfo { key: number; amount: number }
export interface PhaseSplashInfo { key: number; title: string; subtitle: string }

export const BUBBLE_MS = 1600;
export const WIN_MS = 2200;
export const SPLASH_MS = 1400;

const SPLASHES: Record<string, { title: string; subtitle: string }> = {
  Flop: { title: 'Flop!', subtitle: 'Deal 3 cards' },
  Turn: { title: 'Turn!', subtitle: 'Deal 1 card' },
  River: { title: 'River!', subtitle: 'Deal 1 card' },
  Showdown: { title: 'Showdown!', subtitle: 'Show your cards' },
};
const ACTION_SOUNDS: Record<PokerAction, SoundName> = {
  Fold: 'fold', Check: 'check', Call: 'chip', Bet: 'chip', Raise: 'chip', AllIn: 'chip',
};
const CONFETTI_COLORS = ['#EF5B3F', '#F2B632', '#3BB8AE', '#F28DB2', '#2F5DA8', '#F7EBCF'];

function without<T>(map: Record<string, T>, key: string): Record<string, T> {
  const next = { ...map };
  delete next[key];
  return next;
}

export function useTableEvents(gameState: GameState | null, playerId: string | null, announce: (message: string) => void) {
  const [bubbles, setBubbles] = useState<Record<string, ActionBubbleInfo>>({});
  const [wins, setWins] = useState<Record<string, WinInfo>>({});
  const [splash, setSplash] = useState<PhaseSplashInfo | null>(null);
  const lastSeqRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);
  const prevTurnRef = useRef<string | null | undefined>(undefined);
  const entries = gameState?.recentActivity;
  const activeTurnId = gameState?.activePlayerTurnId ?? null;

  useEffect(() => () => timersRef.current.forEach(t => clearTimeout(t)), []);

  useEffect(() => {
    if (!entries || entries.length === 0) return;
    const maxSeq = Math.max(...entries.map(e => e.sequence));
    const lastSeen = lastSeqRef.current;
    lastSeqRef.current = Math.max(lastSeen ?? maxSeq, maxSeq);
    if (lastSeen === null) return;

    const fresh = entries.filter(e => e.sequence > lastSeen && !e.isUndone).sort((a, b) => a.sequence - b.sequence);
    const later = (ms: number, fn: () => void) => timersRef.current.push(window.setTimeout(fn, ms));

    for (const entry of fresh) {
      const key = entry.sequence;
      switch (entry.entryType) {
        case 'PlayerAction': {
          const pid = entry.playerId;
          const action = entry.action;
          if (!pid || !action) break;
          setBubbles(b => ({ ...b, [pid]: { key, action } }));
          later(BUBBLE_MS, () => setBubbles(b => (b[pid]?.key === key ? without(b, pid) : b)));
          if (pid === playerId) {
            playSound(ACTION_SOUNDS[action]);
            vibrate(HAPTICS.action);
          }
          break;
        }
        case 'PotWon': {
          const pid = entry.playerId;
          if (!pid) break;
          setWins(w => ({ ...w, [pid]: { key, amount: entry.amount } }));
          later(WIN_MS, () => setWins(w => (w[pid]?.key === key ? without(w, pid) : w)));
          announce(`${entry.playerName ?? 'A player'} won the pot`);
          if (pid === playerId) {
            playSound('win');
            vibrate(HAPTICS.win);
            if (!prefersReducedMotion()) {
              void confetti({ particleCount: 90, spread: 75, origin: { y: 0.75 }, colors: CONFETTI_COLORS, disableForReducedMotion: true });
            }
          }
          break;
        }
        case 'PhaseAdvanced': {
          const info = SPLASHES[entry.newPhase ?? entry.phase ?? ''];
          if (!info) break;
          setSplash({ key, ...info });
          later(SPLASH_MS, () => setSplash(s => (s?.key === key ? null : s)));
          playSound('deal');
          break;
        }
        case 'HandStarted':
          setSplash({ key, title: `Hand #${entry.handNumber}`, subtitle: 'Deal 2 cards each' });
          later(SPLASH_MS, () => setSplash(s => (s?.key === key ? null : s)));
          break;
        default:
          break;
      }
    }
  }, [entries, playerId, announce]);

  useEffect(() => {
    const prev = prevTurnRef.current;
    prevTurnRef.current = activeTurnId;
    if (prev === undefined) return;
    if (activeTurnId && activeTurnId === playerId && prev !== activeTurnId) {
      playSound('turn');
      vibrate(HAPTICS.turn);
    }
  }, [activeTurnId, playerId]);

  return { bubbles, wins, splash };
}
