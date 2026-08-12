import { useRef, useState } from 'react';
import * as Slider from '@radix-ui/react-slider';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AmountPickerProps {
  type: 'bet' | 'raise';
  min: number;
  max: number;
  pot: number;
  step: number;
  onConfirm: (amount: number) => void;
  onCancel: () => void;
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
  onConfirm,
  onCancel,
}: AmountPickerProps) {
  const [amount, setAmount] = useState(min);
  const testId = type === 'bet' ? 'bet-amount-input' : 'raise-amount-input';
  const label = type === 'bet' ? 'Bet' : 'Raise to';
  const confirmLabel = type === 'bet' ? 'Confirm Bet' : 'Confirm Raise';

  const halfPot = Math.floor(pot / 2);
  const threeFourthPot = Math.floor((pot * 3) / 4);

  // GP-21: snap points for slider — pot fractions + boundaries
  const snapPoints = [...new Set([min, halfPot, threeFourthPot, pot, max].filter(v => v >= min && v <= max))];
  const snapThreshold = Math.max(2, Math.round((max - min) * 0.02));
  const isPointerDragging = useRef(false);

  const handleSliderChange = ([v]: number[]) => {
    const value = clamp(v, min, max);
    if (isPointerDragging.current) {
      const nearest = snapPoints.reduce((best, p) => Math.abs(p - v) < Math.abs(best - v) ? p : best, v);
      const snapped = Math.abs(nearest - v) <= snapThreshold ? nearest : v;
      // GP-21: haptic feedback — stronger on snap point, subtle otherwise
      if (snapped !== v) {
        navigator.vibrate?.(10);
      } else {
        navigator.vibrate?.(3);
      }
      setAmount(snapped);
    } else {
      setAmount(value);
    }
  };

  const decrementAmount = () => setAmount(clamp(amount - step, min, max));
  const incrementAmount = () => setAmount(clamp(amount + step, min, max));

  const setPreset = (value: number) => setAmount(clamp(value, min, max));

  return (
    <div className="bg-surface-card px-4 pt-3 pb-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
      {/* Back button row */}
      <div className="flex items-center mb-3">
        <button
          onClick={onCancel}
          className="flex items-center gap-1 text-text-secondary text-sm hover:text-text-primary transition-colors"
          aria-label="Back to actions"
        >
          <ChevronLeft size={16} />
          Back
        </button>
        <span className="flex-1 text-center text-sm font-semibold text-text-primary">
          {label}: <span className="font-mono text-accent-primary">${amount.toLocaleString()}</span>
        </span>
      </div>

      {/* Slider */}
      <Slider.Root
        min={min}
        max={max}
        step={1}
        value={[amount]}
        onValueChange={handleSliderChange}
        onPointerDown={() => { isPointerDragging.current = true; }}
        onPointerUp={() => { isPointerDragging.current = false; }}
        onLostPointerCapture={() => { isPointerDragging.current = false; }}
        className="relative flex items-center select-none touch-none w-full h-10 mb-4"
        aria-label={`${label} amount`}
      >
        <Slider.Track className="relative grow h-2 rounded-full bg-surface-elevated overflow-hidden">
          <Slider.Range className="absolute h-full bg-accent-primary rounded-full" />
        </Slider.Track>
        <Slider.Thumb
          className="block w-8 h-8 rounded-full bg-white shadow-lg hover:shadow-xl transition-shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary"
          aria-label={`${label} amount`}
        />
      </Slider.Root>

      {/* Preset chips */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {halfPot >= min && (
          <button
            onClick={() => setPreset(halfPot)}
            data-testid="preset-half-pot"
            className={cn(
              'flex-1 py-2 text-xs font-semibold rounded-full border transition-colors',
              amount === halfPot
                ? 'bg-accent-primary border-accent-primary text-white'
                : 'border-surface-elevated text-text-secondary hover:border-text-secondary'
            )}
          >
            ½ Pot
          </button>
        )}
        {threeFourthPot >= min && (
          <button
            onClick={() => setPreset(threeFourthPot)}
            data-testid="preset-three-quarter-pot"
            className={cn(
              'flex-1 py-2 text-xs font-semibold rounded-full border transition-colors',
              amount === threeFourthPot
                ? 'bg-accent-primary border-accent-primary text-white'
                : 'border-surface-elevated text-text-secondary hover:border-text-secondary'
            )}
          >
            ¾ Pot
          </button>
        )}
        {pot >= min && (
          <button
            onClick={() => setPreset(pot)}
            data-testid="preset-pot"
            className={cn(
              'flex-1 py-2 text-xs font-semibold rounded-full border transition-colors',
              amount === pot
                ? 'bg-accent-primary border-accent-primary text-white'
                : 'border-surface-elevated text-text-secondary hover:border-text-secondary'
            )}
          >
            Pot
          </button>
        )}
        <button
          onClick={() => setPreset(max)}
          data-testid="preset-all-in"
          className={cn(
            'flex-1 py-2 text-xs font-semibold rounded-full border transition-colors',
            amount === max
              ? 'bg-accent-danger border-accent-danger text-white'
              : 'border-surface-elevated text-text-secondary hover:border-text-secondary'
          )}
        >
          All-In
        </button>
      </div>

      {/* Amount display + steppers */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={decrementAmount}
          disabled={amount <= min}
          aria-label={`Decrease ${label} amount`}
          data-testid="amount-step-down"
          className="w-12 h-12 rounded-2xl bg-surface-elevated text-text-secondary font-bold text-lg hover:bg-surface-card disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all"
        >
          −
        </button>
        <div
          data-testid={testId}
          aria-live="polite"
          className="flex-1 px-4 py-3 rounded-2xl bg-surface-elevated text-center font-mono text-lg font-semibold text-text-primary"
        >
          ${amount.toLocaleString()}
        </div>
        <button
          onClick={incrementAmount}
          disabled={amount >= max}
          aria-label={`Increase ${label} amount`}
          data-testid="amount-step-up"
          className="w-12 h-12 rounded-2xl bg-surface-elevated text-text-secondary font-bold text-lg hover:bg-surface-card disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all"
        >
          +
        </button>
      </div>
      <button
        onClick={() => onConfirm(amount)}
        className="w-full py-3 rounded-xl bg-accent-primary text-white font-bold text-sm hover:bg-accent-primary/90 active:scale-95 transition-all"
        data-testid={`confirm-${type}`}
      >
        {confirmLabel}
      </button>
    </div>
  );
}
