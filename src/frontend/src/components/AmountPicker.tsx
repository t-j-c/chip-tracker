import { useRef, useState } from 'react';
import * as Slider from '@radix-ui/react-slider';
import { ChevronLeft } from 'lucide-react';
import { cn, formatMoney } from '@/lib/utils';
import { HAPTICS, vibrate } from '../lib/haptics';
import RetroButton from './ui/RetroButton';

interface AmountPickerProps {
  type: 'bet' | 'raise';
  min: number;
  max: number;
  pot: number;
  step: number;
  /** Bet the player is facing; pre-flop raise presets are multiples of it. */
  currentBet: number;
  isPreFlop: boolean;
  onConfirm: (amount: number) => void;
  onCancel: () => void;
}

interface Preset {
  label: string;
  value: number;
  testId: string;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export default function AmountPicker({
  type,
  min,
  max,
  pot,
  step,
  currentBet,
  isPreFlop,
  onConfirm,
  onCancel,
}: AmountPickerProps) {
  const [amount, setAmount] = useState(min);
  const testId = type === 'bet' ? 'bet-amount-input' : 'raise-amount-input';
  const label = type === 'bet' ? 'Bet' : 'Raise to';
  const confirmLabel = type === 'bet' ? 'Confirm Bet' : 'Confirm Raise';

  const presets: Preset[] = (isPreFlop && type === 'raise'
    ? [
        { label: '2x', value: currentBet * 2, testId: 'preset-2x' },
        { label: '3x', value: currentBet * 3, testId: 'preset-3x' },
        { label: '4x', value: currentBet * 4, testId: 'preset-4x' },
        { label: 'Pot', value: pot, testId: 'preset-pot' },
      ]
    : [
        { label: '½ Pot', value: Math.floor(pot / 2), testId: 'preset-half-pot' },
        { label: '¾ Pot', value: Math.floor((pot * 3) / 4), testId: 'preset-three-quarter-pot' },
        { label: 'Pot', value: pot, testId: 'preset-pot' },
      ]
  ).filter(p => p.value >= min && p.value < max);

  // Slider snap points: every visible preset plus both ends.
  const snapPoints = [...new Set([min, ...presets.map(p => p.value), max])];
  const snapThreshold = Math.max(2, Math.round((max - min) * 0.02));
  const isPointerDragging = useRef(false);

  const handleSliderChange = ([v]: number[]) => {
    const value = clamp(v, min, max);
    if (isPointerDragging.current) {
      const nearest = snapPoints.reduce((best, p) => Math.abs(p - v) < Math.abs(best - v) ? p : best, v);
      const snapped = Math.abs(nearest - v) <= snapThreshold ? nearest : v;
      vibrate(snapped !== v ? HAPTICS.snap : HAPTICS.tick);
      setAmount(snapped);
    } else {
      setAmount(value);
    }
  };

  const chip = (selected: boolean) => cn(
    'retro-btn min-h-10 flex-1 px-1 text-sm',
    selected ? 'bg-mustard text-ink' : 'bg-card text-ink',
  );

  return (
    <div
      className="border-t-[3px] border-ink bg-paper-deep px-3 pt-2"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      data-testid="amount-picker"
    >
      <div className="mb-2 flex items-center gap-2">
        <RetroButton size="sm" onClick={onCancel} aria-label="Back to actions" className="w-11 px-0">
          <ChevronLeft aria-hidden="true" size={20} />
        </RetroButton>
        <RetroButton
          size="sm"
          onClick={() => setAmount(clamp(amount - step, min, max))}
          disabled={amount <= min}
          aria-label={`Decrease ${label} amount`}
          data-testid="amount-step-down"
          className="w-11 px-0 text-xl"
        >
          −
        </RetroButton>
        <div className="min-w-0 flex-1 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-ink-soft">{label}</div>
          <div data-testid={testId} aria-live="polite" className="font-display text-3xl leading-8 text-ink tabular-nums">
            {formatMoney(amount)}
          </div>
        </div>
        <RetroButton
          size="sm"
          onClick={() => setAmount(clamp(amount + step, min, max))}
          disabled={amount >= max}
          aria-label={`Increase ${label} amount`}
          data-testid="amount-step-up"
          className="w-11 px-0 text-xl"
        >
          +
        </RetroButton>
      </div>

      <Slider.Root
        min={min}
        max={max}
        step={1}
        value={[amount]}
        onValueChange={handleSliderChange}
        onPointerDown={() => { isPointerDragging.current = true; }}
        onPointerUp={() => { isPointerDragging.current = false; }}
        onLostPointerCapture={() => { isPointerDragging.current = false; }}
        className="relative mb-3 flex h-11 w-full touch-none select-none items-center"
        aria-label={`${label} amount`}
      >
        <Slider.Track className="relative h-3.5 grow overflow-hidden rounded-full border-[3px] border-ink bg-card">
          <Slider.Range className="absolute h-full bg-mustard" />
        </Slider.Track>
        <Slider.Thumb
          className="block h-9 w-9 rounded-full border-[3px] border-ink bg-tomato shadow-hard-sm outline-none [background-image:radial-gradient(circle,var(--color-card)_0_28%,transparent_30%)] focus-visible:ring-4 focus-visible:ring-royal"
          aria-label={`${label} amount`}
        />
      </Slider.Root>

      <div className="mb-3 flex gap-2">
        {presets.map(p => (
          <button key={p.testId} type="button" onClick={() => setAmount(clamp(p.value, min, max))} data-testid={p.testId} className={chip(amount === p.value)}>
            {p.label}
          </button>
        ))}
        <button type="button" onClick={() => setAmount(max)} data-testid="preset-all-in" className={chip(amount === max)}>
          All-In
        </button>
      </div>

      <RetroButton
        tone="mustard"
        size="lg"
        block
        onClick={() => onConfirm(amount)}
        data-testid={`confirm-${type}`}
        className="uppercase"
      >
        {confirmLabel}
      </RetroButton>
    </div>
  );
}
