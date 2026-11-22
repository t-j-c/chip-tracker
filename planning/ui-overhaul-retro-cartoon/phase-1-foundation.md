# Phase 1: Foundation (design system and shared primitives)

**Goal:** Install the retro-cartoon design tokens, global CSS, fonts, favicon, device settings, sound/haptics/motion helpers and the shared UI primitives that every later phase uses.

**Before you start:** read [02-test-contract.md](./02-test-contract.md). All paths are relative to the repository root.

After this phase, pages that still use the removed colour classes (`bg-surface-*`, `text-text-*`, `accent-*`) look unstyled. Phases 2–5 replace all of them.

---

### Step 1.1: Delete unused Vite template files

Nothing imports these files; they are leftovers from the Vite starter.

- Delete `src/frontend/src/App.css`
- Delete `src/frontend/src/assets`
- Delete `src/frontend/public/icons.svg`

### Step 1.2: Replace `src/frontend/index.html`

This loads the three Google Fonts (Bangers, Fredoka, Lilita One) and sets the ink theme colour. It also re-enables pinch-zoom (`user-scalable=no` is removed) and adds `viewport-fit=cover` for safe areas.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#1B1718" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Bangers&family=Fredoka:wght@400;500;600;700&family=Lilita+One&display=swap" rel="stylesheet" />
    <title>Deal Me In</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### Step 1.3: Replace `src/frontend/public/favicon.svg`

The cartoon chip mascot.

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="29" fill="#EF5B3F" stroke="#1B1718" stroke-width="3"/>
  <g fill="#F7EBCF" stroke="#1B1718" stroke-width="1.5">
    <rect x="29" y="3.5" width="6" height="9" rx="2"/>
    <rect x="29" y="3.5" width="6" height="9" rx="2" transform="rotate(60 32 32)"/>
    <rect x="29" y="3.5" width="6" height="9" rx="2" transform="rotate(120 32 32)"/>
    <rect x="29" y="3.5" width="6" height="9" rx="2" transform="rotate(180 32 32)"/>
    <rect x="29" y="3.5" width="6" height="9" rx="2" transform="rotate(240 32 32)"/>
    <rect x="29" y="3.5" width="6" height="9" rx="2" transform="rotate(300 32 32)"/>
  </g>
  <circle cx="32" cy="32" r="18" fill="#F7EBCF" stroke="#1B1718" stroke-width="3"/>
  <ellipse cx="26.5" cy="29" rx="2.6" ry="4" fill="#1B1718"/>
  <ellipse cx="37.5" cy="29" rx="2.6" ry="4" fill="#1B1718"/>
  <circle cx="27.3" cy="27.4" r="0.9" fill="#FFFFFF"/>
  <circle cx="38.3" cy="27.4" r="0.9" fill="#FFFFFF"/>
  <path d="M24.5 36.5 Q32 43.5 39.5 36.5" fill="none" stroke="#1B1718" stroke-width="3" stroke-linecap="round"/>
</svg>
```

### Step 1.4: Replace `src/frontend/src/index.css`

This adds:
- **Design tokens** (`@theme`) and the **`landscape-short`** custom variant.
- **Retro component classes**: `.retro-panel`, `.retro-btn`, `.retro-input`, `.text-outline`, `.sunburst`, `.felt`, `.table-rail`, `.card-back`, `.turn-ring`, `.winner-ring`, `.table-stage`/`.table-piece` and `.win-float`.
- **All keyframe animations.**
- **Reduced-motion rules**, for both the OS setting and the in-app toggle.

```css
@import "tailwindcss";

@custom-variant landscape-short (@media (orientation: landscape) and (max-height: 500px));

@theme {
  --color-ink: #1B1718;
  --color-ink-soft: #4A4044;
  --color-paper: #F7EBCF;
  --color-paper-deep: #E8D5A9;
  --color-card: #FFF8E8;
  --color-felt: #1A6B4C;
  --color-felt-dark: #0E4A37;
  --color-felt-light: #23805C;
  --color-rail: #7A3B22;
  --color-tomato: #EF5B3F;
  --color-tomato-deep: #C92F1F;
  --color-mustard: #F2B632;
  --color-teal: #3BB8AE;
  --color-royal: #2F5DA8;
  --color-bubblegum: #F28DB2;
  --color-grape: #5B3A8C;
  --font-sans: 'Fredoka', system-ui, sans-serif;
  --font-display: 'Lilita One', 'Fredoka', system-ui, sans-serif;
  --font-comic: 'Bangers', 'Lilita One', system-ui, sans-serif;
  --shadow-hard-sm: 2px 2px 0 0 #1B1718;
  --shadow-hard: 4px 4px 0 0 #1B1718;
  --shadow-hard-lg: 6px 6px 0 0 #1B1718;
  --ease-pop: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-anticipate: cubic-bezier(0.36, 0, 0.66, -0.56);
}

html, body { margin: 0; padding: 0; }
body {
  background-color: var(--color-paper);
  background-image: radial-gradient(circle, rgb(27 23 24 / 0.07) 1px, transparent 1.6px);
  background-size: 14px 14px;
  color: var(--color-ink);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  overscroll-behavior: none;
}
#root { min-height: 100dvh; }
* { box-sizing: border-box; }
button, a, [role=button] { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
:focus-visible { outline: 3px solid var(--color-royal); outline-offset: 3px; }

@layer components {
  .retro-panel {
    background-color: var(--color-card);
    border: 3px solid var(--color-ink);
    border-radius: 1.25rem;
    box-shadow: var(--shadow-hard-lg);
  }
  .retro-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-family: var(--font-display);
    letter-spacing: 0.02em;
    line-height: 1.1;
    border: 3px solid var(--color-ink);
    border-radius: 0.875rem;
    box-shadow: var(--shadow-hard);
    transition: transform 120ms var(--ease-pop), box-shadow 120ms var(--ease-pop), filter 120ms ease-out;
    user-select: none;
    cursor: pointer;
  }
  .retro-btn:hover:not(:disabled) { filter: brightness(1.06); }
  .retro-btn:active:not(:disabled) { transform: translate(3px, 3px); box-shadow: 1px 1px 0 0 var(--color-ink); }
  .retro-btn:disabled { opacity: 0.55; cursor: not-allowed; box-shadow: var(--shadow-hard-sm); }
  .retro-input {
    width: 100%;
    background-color: var(--color-card);
    color: var(--color-ink);
    border: 3px solid var(--color-ink);
    border-radius: 0.875rem;
    box-shadow: inset 3px 3px 0 0 rgb(27 23 24 / 0.12);
    font-size: 1rem;
  }
  .retro-input:focus { outline: none; border-color: var(--color-royal); }
  .text-outline {
    -webkit-text-stroke: 2px var(--color-ink);
    paint-order: stroke fill;
  }
  .sunburst {
    background: repeating-conic-gradient(from 0deg, var(--color-mustard) 0deg 12deg, #F8CF66 12deg 24deg);
  }
  .felt {
    background-color: var(--color-felt);
    background-image:
      radial-gradient(ellipse at 50% 45%, var(--color-felt-light) 0%, transparent 65%),
      radial-gradient(circle, rgb(0 0 0 / 0.12) 1px, transparent 1.6px);
    background-size: 100% 100%, 10px 10px;
  }
  .table-rail {
    border: 10px solid var(--color-rail);
    box-shadow:
      inset 0 0 0 3px var(--color-ink),
      0 0 0 3px var(--color-ink),
      6px 8px 0 3px var(--color-ink);
  }
  .card-back {
    background-color: var(--color-tomato-deep);
    background-image:
      repeating-linear-gradient(45deg, rgb(247 235 207 / 0.4) 0 2px, transparent 2px 6px),
      repeating-linear-gradient(-45deg, rgb(247 235 207 / 0.4) 0 2px, transparent 2px 6px);
  }
  .turn-ring { box-shadow: 0 0 0 4px var(--color-mustard), 0 0 0 7px var(--color-ink); }
  .winner-ring { box-shadow: 0 0 0 5px var(--color-mustard), 0 0 22px 8px rgb(242 182 50 / 0.7); }
  .table-stage { container-type: size; }
  @container (max-height: 440px) {
    .table-piece { scale: 0.82; }
  }
  /* Keep the decorative amount out of Playwright's text selectors. */
  .win-float::after { content: attr(data-amount); }
}

@keyframes popIn {
  0% { opacity: 0; transform: scale(0.6); }
  70% { opacity: 1; transform: scale(1.06); }
  100% { opacity: 1; transform: scale(1); }
}
.animate-pop-in { animation: popIn 320ms var(--ease-pop) both; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.animate-fade-in { animation: fadeIn 180ms ease-out both; }
@keyframes turnPulse {
  0%, 100% { box-shadow: 0 0 0 3px var(--color-mustard), 0 0 0 6px var(--color-ink); }
  50% { box-shadow: 0 0 0 7px var(--color-mustard), 0 0 0 10px var(--color-ink); }
}
.animate-turn-pulse { animation: turnPulse 1.2s ease-in-out infinite; }
@keyframes winnerGlow {
  0%, 100% { box-shadow: 0 0 0 4px var(--color-mustard), 0 0 18px 6px rgb(242 182 50 / 0.6); }
  50% { box-shadow: 0 0 0 8px var(--color-mustard), 0 0 30px 12px rgb(242 182 50 / 0.8); }
}
.animate-winner-glow { animation: winnerGlow 0.9s ease-in-out infinite; }
@keyframes bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
.animate-bob { animation: bob 0.9s ease-in-out infinite; }
@keyframes bubble {
  0% { opacity: 0; transform: scale(0.4) rotate(-8deg); }
  12% { opacity: 1; transform: scale(1.12) rotate(3deg); }
  22% { opacity: 1; transform: scale(1) rotate(0deg); }
  80% { opacity: 1; transform: scale(1) translateY(0); }
  100% { opacity: 0; transform: scale(0.95) translateY(-8px); }
}
.animate-bubble { animation: bubble 1600ms var(--ease-pop) forwards; }
@keyframes floatUp {
  0% { opacity: 0; transform: translateY(8px) scale(0.7); }
  15% { opacity: 1; transform: translateY(0) scale(1.1); }
  70% { opacity: 1; transform: translateY(-24px) scale(1); }
  100% { opacity: 0; transform: translateY(-40px) scale(1); }
}
.animate-float-up { animation: floatUp 2200ms ease-out forwards; }
@keyframes dealIn {
  0% { opacity: 0; transform: translateY(-28px) rotate(-25deg) scale(0.6); }
  100% { opacity: 1; transform: translateY(0) rotate(0deg) scale(1); }
}
.animate-deal-in { animation: dealIn 320ms var(--ease-pop) both; }
@keyframes splash {
  0% { opacity: 0; transform: scale(0.3) rotate(-10deg); }
  18% { opacity: 1; transform: scale(1.15) rotate(2deg); }
  28% { opacity: 1; transform: scale(1) rotate(-2deg); }
  80% { opacity: 1; transform: scale(1) rotate(-2deg); }
  100% { opacity: 0; transform: scale(1.2) rotate(-2deg); }
}
.animate-splash { animation: splash 1400ms var(--ease-pop) forwards; }
@keyframes chipFlight {
  0% { left: var(--from-x); top: var(--from-y); opacity: 1; transform: translate(-50%, -50%) scale(1); }
  85% { opacity: 1; }
  100% { left: var(--to-x); top: var(--to-y); opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
}
.animate-chip-flight { animation: chipFlight 520ms cubic-bezier(0.5, 0, 0.3, 1) forwards; }
@keyframes countdown { from { transform: scaleX(1); } to { transform: scaleX(0); } }
.animate-countdown { animation: countdown linear forwards; transform-origin: left center; }
@keyframes slideInRight {
  from { opacity: 0; transform: translateX(24px); }
  to { opacity: 1; transform: translateX(0); }
}
.animate-slide-in { animation: slideInRight 0.3s ease-out both; }
@keyframes slideUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-slide-up { animation: slideUp 0.22s var(--ease-pop) both; }
@keyframes slideDown {
  from { opacity: 0; transform: translateY(-100%); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-slide-down { animation: slideDown 0.28s var(--ease-pop) both; }
@keyframes ellipsis {
  0% { content: '.'; } 33% { content: '..'; } 66% { content: '...'; } 100% { content: '.'; }
}
.animate-ellipsis::after { content: '.'; animation: ellipsis 1.2s steps(1) infinite; }
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  40% { transform: translateX(6px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
}
.animate-shake { animation: shake 0.3s ease-in-out both; }
@keyframes foldFlip {
  0% { transform: perspective(400px) rotateY(0deg); }
  50% { transform: perspective(400px) rotateY(90deg); }
  100% { transform: perspective(400px) rotateY(0deg); }
}
.animate-fold-flip { animation: foldFlip 0.4s ease-in-out both; }
@keyframes spinSlow { to { transform: rotate(360deg); } }
.animate-spin-slow { animation: spinSlow 18s linear infinite; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
  .keep-visible-reduced { animation: none !important; }
}
html[data-reduce-motion="true"] *,
html[data-reduce-motion="true"] *::before,
html[data-reduce-motion="true"] *::after {
  animation-duration: 1ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 1ms !important;
  scroll-behavior: auto !important;
}
html[data-reduce-motion="true"] .keep-visible-reduced { animation: none !important; }
```

### Step 1.5: Replace `src/frontend/src/App.tsx`

Same routes; the commented-out Vite template block at the bottom is removed.

```tsx
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/AppShell';
import CreateRoomPage from './pages/CreateRoomPage';
import GamePage from './pages/GamePage';
import JoinRoomPage from './pages/JoinRoomPage';
import LobbyPage from './pages/LobbyPage';

export default function App() {
  return (
    <Router>
      <AppShell>
        <Routes>
          <Route path="/" element={<CreateRoomPage />} />
          <Route path="/room/:roomCode/lobby" element={<LobbyPage />} />
          <Route path="/room/:roomCode" element={<GamePage />} />
          <Route path="/join" element={<JoinRoomPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </Router>
  );
}
```

### Step 1.6: Replace `src/frontend/src/lib/utils.ts`

`getAvatarColor` now returns a **hex colour** (it used to return a Tailwind class) from the 9-colour cartoon palette, and `formatMoney` is new.

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const AVATAR_COLORS = [
  '#EF5B3F',
  '#3BB8AE',
  '#F2B632',
  '#F28DB2',
  '#6EC1E4',
  '#9BCB4A',
  '#F38B3C',
  '#B39DDB',
  '#F6B48F',
] as const;

/** Avatar fill for a seat index (position in the table's player list). */
export function getAvatarColor(index: number): string {
  const n = AVATAR_COLORS.length;
  return AVATAR_COLORS[((index % n) + n) % n];
}

/** "$1,234" — the one money format used everywhere. */
export function formatMoney(amount: number): string {
  return `$${amount.toLocaleString()}`;
}
```

### Step 1.7: Create `src/frontend/src/stores/settingsStore.ts`

Device-local preferences (sound, vibration, reduce motion), persisted in `localStorage` under `dmi.settings`.

```ts
import { create } from 'zustand';

const STORAGE_KEY = 'dmi.settings';

export interface Settings {
  soundOn: boolean;
  hapticsOn: boolean;
  reduceMotion: boolean;
}

const DEFAULTS: Settings = { soundOn: true, hapticsOn: true, reduceMotion: false };

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function save(settings: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private mode / storage full: settings just won't persist.
  }
}

export interface SettingsStore extends Settings {
  toggle: (key: keyof Settings) => void;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...load(),
  toggle: (key) => {
    const { soundOn, hapticsOn, reduceMotion } = get();
    const next: Settings = { soundOn, hapticsOn, reduceMotion, [key]: !get()[key] };
    save(next);
    set(next);
  },
}));
```

### Step 1.8: Create `src/frontend/src/lib/motion.ts`

```ts
import { useSettingsStore } from '../stores/settingsStore';

export function prefersReducedMotion(): boolean {
  if (useSettingsStore.getState().reduceMotion) return true;
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
```

### Step 1.9: Create `src/frontend/src/lib/haptics.ts`

```ts
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
```

### Step 1.10: Create `src/frontend/src/lib/sound.ts`

All sounds are synthesized with the Web Audio API, so there are no asset files.

```ts
import { useSettingsStore } from '../stores/settingsStore';

export type SoundName = 'turn' | 'chip' | 'check' | 'fold' | 'deal' | 'win' | 'error';

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!context) context = new Ctor();
  if (context.state === 'suspended') void context.resume().catch(() => {});
  return context;
}

export function unlockAudio(): void {
  getContext();
}

interface ToneOptions {
  freq: number;
  start: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  slideTo?: number;
}

function tone(c: AudioContext, { freq, start, duration, type = 'sine', gain = 0.2, slideTo }: ToneOptions) {
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp).connect(c.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

interface NoiseOptions {
  start: number;
  duration: number;
  gain: number;
  filterFreq: number;
}

function noise(c: AudioContext, { start, duration, gain, filterFreq }: NoiseOptions) {
  const buffer = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * duration)), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = filterFreq;
  const amp = c.createGain();
  amp.gain.setValueAtTime(gain, start);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  src.connect(filter).connect(amp).connect(c.destination);
  src.start(start);
  src.stop(start + duration);
}

const RECIPES: Record<SoundName, (c: AudioContext, t: number) => void> = {
  turn: (c, t) => {
    tone(c, { freq: 880, start: t, duration: 0.12, type: 'triangle', gain: 0.25 });
    tone(c, { freq: 1320, start: t + 0.12, duration: 0.18, type: 'triangle', gain: 0.25 });
  },
  chip: (c, t) => {
    noise(c, { start: t, duration: 0.05, gain: 0.4, filterFreq: 3500 });
    noise(c, { start: t + 0.07, duration: 0.05, gain: 0.3, filterFreq: 4200 });
  },
  check: (c, t) => {
    tone(c, { freq: 180, start: t, duration: 0.08, type: 'square', gain: 0.15 });
    tone(c, { freq: 160, start: t + 0.11, duration: 0.08, type: 'square', gain: 0.15 });
  },
  fold: (c, t) => noise(c, { start: t, duration: 0.22, gain: 0.25, filterFreq: 1200 }),
  deal: (c, t) => {
    for (let i = 0; i < 3; i++) noise(c, { start: t + i * 0.08, duration: 0.06, gain: 0.25, filterFreq: 2500 });
  },
  win: (c, t) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) =>
      tone(c, { freq, start: t + i * 0.09, duration: 0.22, type: 'triangle', gain: 0.22 }),
    );
  },
  error: (c, t) => tone(c, { freq: 220, start: t, duration: 0.25, type: 'sawtooth', gain: 0.12, slideTo: 110 }),
};

export function playSound(name: SoundName): void {
  if (!useSettingsStore.getState().soundOn) return;
  const c = getContext();
  if (!c || c.state !== 'running') return;
  try {
    RECIPES[name](c, c.currentTime + 0.01);
  } catch {
    // Audio is decoration; never let it break the game.
  }
}
```

### Step 1.11: Create `src/frontend/src/lib/chips.ts`

```ts
export function chipCountForAmount(amount: number, bigBlind: number): number {
  if (amount <= 0) return 0;
  const unit = Math.max(1, bigBlind);
  return Math.min(5, Math.max(1, Math.ceil(Math.log2(amount / unit + 1))));
}
```

### Step 1.12: Replace `src/frontend/src/hooks/useAnimatedNumber.ts`

The only change is that the value jumps straight to its target when reduced motion is on.

```ts
import { useRef, useState, useEffect } from 'react';
import { prefersReducedMotion } from '../lib/motion';

export function useAnimatedNumber(target: number, duration = 400): number {
  const [displayed, setDisplayed] = useState(target);
  const prevRef = useRef(target);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const from = prevRef.current;
    if (from === target) return;

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    if (prefersReducedMotion()) {
      prevRef.current = target;
      rafRef.current = null;
      setDisplayed(target);
      return;
    }

    startTimeRef.current = null;

    const animate = (now: number) => {
      if (startTimeRef.current === null) startTimeRef.current = now;
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + (target - from) * eased);
      setDisplayed(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        prevRef.current = target;
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return displayed;
}
```

### Step 1.13: Create `src/frontend/src/components/ui/RetroButton.tsx`

Tones and their uses:
- `tomato` = Fold
- `teal` = Check and create/confirm CTAs
- `royal` = Call
- `mustard` = Bet/Raise and primary highlight
- `grape` = All-In
- `cream` = neutral

The button defaults to `type="button"`, so form submit buttons must pass `type="submit"`.

```tsx
import type { ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const retroButton = cva('retro-btn', {
  variants: {
    tone: {
      tomato: 'bg-tomato text-ink',
      teal: 'bg-teal text-ink',
      royal: 'bg-royal text-paper',
      mustard: 'bg-mustard text-ink',
      grape: 'bg-grape text-paper',
      bubblegum: 'bg-bubblegum text-ink',
      cream: 'bg-card text-ink',
      ink: 'bg-ink text-paper',
    },
    size: {
      sm: 'min-h-10 px-3 text-sm',
      md: 'min-h-12 px-4 text-base',
      lg: 'min-h-14 px-5 text-lg',
      xl: 'min-h-16 px-6 text-xl',
    },
    block: { true: 'w-full', false: '' },
  },
  defaultVariants: { tone: 'cream', size: 'md', block: false },
});

export interface RetroButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof retroButton> {}

export default function RetroButton({ className, tone, size, block, type = 'button', ...props }: RetroButtonProps) {
  return <button type={type} className={cn(retroButton({ tone, size, block }), className)} {...props} />;
}
```

### Step 1.14: Create `src/frontend/src/components/ui/Avatar.tsx`

```tsx
import { cn, getAvatarColor } from '@/lib/utils';

const SIZES = {
  sm: 'h-8 w-8 text-base border-2',
  md: 'h-11 w-11 text-xl border-[3px]',
  lg: 'h-14 w-14 text-2xl border-[3px]',
  xl: 'h-16 w-16 text-3xl border-[3px]',
} as const;

interface AvatarProps {
  name: string;
  colorIndex: number;
  size?: keyof typeof SIZES;
  className?: string;
}

export default function Avatar({ name, colorIndex, size = 'md', className }: AvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center rounded-full border-ink font-display leading-none text-ink',
        SIZES[size],
        className,
      )}
      style={{ backgroundColor: getAvatarColor(colorIndex) }}
    >
      <span className="absolute left-[18%] top-[12%] h-[22%] w-[32%] -rotate-12 rounded-full bg-white/50" />
      <span className="relative">{initial}</span>
    </span>
  );
}
```

### Step 1.15: Create `src/frontend/src/components/ui/ChipStack.tsx`

```tsx
const CHIP_COLORS = ['#D93A2B', '#2F5DA8', '#2E9E5B', '#7A4BA8', '#F2B632', '#1B1718'];
const INK = '#1B1718';
const CREAM = '#F7EBCF';

interface ChipStackProps {
  count: number;
  size?: number;
  colorOffset?: number;
  className?: string;
}

export default function ChipStack({ count, size = 28, colorOffset = 0, className }: ChipStackProps) {
  const n = Math.max(1, Math.min(5, Math.round(count)));
  const width = 40;
  const rx = 18;
  const ry = 7.5;
  const thickness = 5;
  const height = ry * 2 + thickness * n + 4;

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${width} ${height}`}
      width={size}
      height={(size * height) / width}
      className={className}
    >
      {Array.from({ length: n }, (_, i) => {
        const cy = height - 2 - ry - thickness - i * thickness;
        const color = CHIP_COLORS[(i + colorOffset) % CHIP_COLORS.length];
        return (
          <g key={i}>
            <path
              d={`M ${20 - rx} ${cy} v ${thickness} a ${rx} ${ry} 0 0 0 ${2 * rx} 0 v ${-thickness} z`}
              fill={color}
              stroke={INK}
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <ellipse cx="20" cy={cy} rx={rx} ry={ry} fill={color} stroke={INK} strokeWidth="2" />
            <ellipse
              cx="20"
              cy={cy}
              rx={rx * 0.6}
              ry={ry * 0.6}
              fill="none"
              stroke={CREAM}
              strokeWidth="2"
              strokeDasharray="4 3"
            />
          </g>
        );
      })}
    </svg>
  );
}
```

### Step 1.16: Create `src/frontend/src/components/ui/DealerChip.tsx`

```tsx
import { cn } from '@/lib/utils';

interface DealerChipProps {
  variant: 'puck' | 'pill';
  className?: string;
}

/**
 * Exactly one element with aria-label="Dealer" may be on the game page at a time,
 * and the hero's pill must contain the visible word "Dealer".
 */
export default function DealerChip({ variant, className }: DealerChipProps) {
  if (variant === 'puck') {
    return (
      <span
        role="img"
        aria-label="Dealer"
        className={cn(
          'inline-flex h-6 w-6 items-center justify-center rounded-full border-[3px] border-ink bg-card font-display text-xs leading-none text-ink shadow-hard-sm',
          className,
        )}
      >
        D
      </span>
    );
  }
  return (
    <span
      aria-label="Dealer"
      className={cn(
        'inline-flex items-center gap-1 rounded-full border-2 border-ink bg-card px-2 py-px font-display text-xs leading-4 text-ink',
        className,
      )}
    >
      <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full border-2 border-ink bg-tomato" />
      Dealer
    </span>
  );
}
```

### Step 1.17: Create `src/frontend/src/components/ui/StatusTag.tsx`

```tsx
import type { Player } from '../../types/game';
import { cn } from '@/lib/utils';

const TAG = 'inline-flex items-center rounded-full border-2 border-ink px-1.5 py-px font-display text-[11px] uppercase leading-4 tracking-wide';

export default function StatusTag({ player, showFolded = false }: { player: Player; showFolded?: boolean }) {
  if (player.isEliminated) return <span className={cn(TAG, 'bg-ink text-paper')}>Eliminated</span>;
  if (player.isAwaitingRebuy) return <span className={cn(TAG, 'bg-mustard text-ink')}>Deciding</span>;
  if (player.isAllIn) return <span className={cn(TAG, 'bg-grape text-paper')}>All In</span>;
  if (showFolded && player.hasFolded) return <span className={cn(TAG, 'bg-tomato text-ink')}>Folded</span>;
  return null;
}
```

### Step 1.18: Replace `src/frontend/src/components/ChipLogo.tsx`

This adds the named export `ChipLogoMark`, which the header, lobby and loading screen use. The default export keeps its `subtitle` prop.

```tsx
import { cn } from '@/lib/utils';

const INK = '#1B1718';
const CREAM = '#F7EBCF';

export function ChipLogoMark({ size = 48, className }: { size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 64 64" className={className}>
      <circle cx="32" cy="32" r="29" fill="#EF5B3F" stroke={INK} strokeWidth="3" />
      {[0, 60, 120, 180, 240, 300].map(deg => (
        <rect
          key={deg}
          x="29"
          y="3.5"
          width="6"
          height="9"
          rx="2"
          fill={CREAM}
          stroke={INK}
          strokeWidth="1.5"
          transform={`rotate(${deg} 32 32)`}
        />
      ))}
      <circle cx="32" cy="32" r="18" fill={CREAM} stroke={INK} strokeWidth="3" />
      <ellipse cx="26.5" cy="29" rx="2.6" ry="4" fill={INK} />
      <ellipse cx="37.5" cy="29" rx="2.6" ry="4" fill={INK} />
      <circle cx="27.3" cy="27.4" r="0.9" fill="#FFFFFF" />
      <circle cx="38.3" cy="27.4" r="0.9" fill="#FFFFFF" />
      <circle cx="22.5" cy="35" r="2.4" fill="#F28DB2" opacity="0.8" />
      <circle cx="41.5" cy="35" r="2.4" fill="#F28DB2" opacity="0.8" />
      <path d="M24.5 36.5 Q32 43.5 39.5 36.5" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

interface ChipLogoProps {
  subtitle?: string;
  className?: string;
}

export default function ChipLogo({ subtitle, className }: ChipLogoProps) {
  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <div aria-hidden="true" className="relative grid h-24 w-24 place-items-center">
        <div className="sunburst animate-spin-slow absolute inset-0 rounded-full border-[3px] border-ink shadow-hard" />
        <ChipLogoMark size={68} className="relative" />
      </div>
      <h1 className="text-outline font-display text-5xl uppercase leading-none tracking-wide text-paper drop-shadow-[4px_4px_0_#1B1718]">
        {subtitle ?? 'Deal Me In'}
      </h1>
    </div>
  );
}
```

### Step 1.19: Replace `src/frontend/src/components/AppShell.tsx`

This applies the in-app Reduce Motion setting to `<html data-reduce-motion>` and unlocks audio on every tap.

```tsx
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
```

### Step 1.20: Replace `src/frontend/src/components/DialogShell.tsx`

The props are the same as before, plus two new optional ones: `centerTitle` and `closeLabel`.

```tsx
import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DialogShellProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  children: ReactNode;
  ariaDescribedBy?: string;
  testId?: string;
  sizeClass?: string;
  showCloseButton?: boolean;
  isFixed?: boolean;
  centerTitle?: boolean;
  closeLabel?: string;
}

export function DialogShell({
  open = true,
  onOpenChange,
  title,
  children,
  ariaDescribedBy,
  testId,
  sizeClass = 'max-w-sm',
  showCloseButton = true,
  isFixed = false,
  centerTitle = false,
  closeLabel = 'Close dialog',
}: DialogShellProps) {
  return (
    <Dialog.Root open={open} onOpenChange={isFixed ? undefined : onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-fade-in fixed inset-0 z-50 bg-ink/60 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn('fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 outline-none', sizeClass)}
          aria-describedby={ariaDescribedBy}
          data-testid={testId}
        >
          <div className="retro-panel animate-pop-in max-h-[85dvh] overflow-y-auto p-5">
            <div className={cn('mb-4 flex items-start gap-3', centerTitle ? 'justify-center' : 'justify-between')}>
              <Dialog.Title className="inline-block -rotate-2 rounded-xl border-[3px] border-ink bg-mustard px-3 py-0.5 font-display text-2xl uppercase leading-tight tracking-wide text-ink shadow-hard-sm">
                {title}
              </Dialog.Title>
              {showCloseButton && !isFixed && (
                <Dialog.Close asChild>
                  <button
                    aria-label={closeLabel}
                    className="retro-btn h-10 w-10 shrink-0 bg-card text-ink"
                  >
                    <X aria-hidden="true" size={18} />
                  </button>
                </Dialog.Close>
              )}
            </div>
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

---

## Verify (from `src/frontend`)

```powershell
npx tsc -b
npm run lint
npm test
```

Expected: all three exit with code 0. `npm test` reports **68 passed**, the same count as before this phase.
