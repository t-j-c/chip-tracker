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
