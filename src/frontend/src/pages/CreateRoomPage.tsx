import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import type { CreateRoomRequest, CreateRoomResponse } from '../types/game';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import ChipLogo from '../components/ChipLogo';
import ChipStack from '../components/ui/ChipStack';
import RetroButton from '../components/ui/RetroButton';
import { useApiWarmUp } from '../hooks/useApiWarmUp';

type PresetId = 'casual' | 'standard' | 'deep';

const PRESETS: { id: PresetId; label: string; stack: number; sb: number; bb: number; desc: string; chips: number }[] = [
  { id: 'casual',   label: 'Casual',     stack: 1000, sb: 5,  bb: 10, desc: '1,000 · 5/10',  chips: 1 },
  { id: 'standard', label: 'Standard',   stack: 1000, sb: 10, bb: 20, desc: '1,000 · 10/20', chips: 3 },
  { id: 'deep',     label: 'Deep Stack', stack: 5000, sb: 25, bb: 50, desc: '5,000 · 25/50', chips: 5 },
];

const HOW_IT_WORKS = [
  { n: 1, text: 'Create a table' },
  { n: 2, text: 'Friends scan the QR code' },
  { n: 3, text: 'Deal real cards. We count the chips.' },
];

interface StepperInputProps {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  error?: string | null;
}

function StepperInput({ id, label, value, onChange, min = 1, step = 5, error }: StepperInputProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block font-display text-sm uppercase tracking-wide text-ink">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <RetroButton
          size="sm"
          onClick={() => onChange(Math.max(min, value - step))}
          aria-label={`Decrease ${label}`}
          className="h-11 w-11 shrink-0 px-0 text-xl"
        >
          −
        </RetroButton>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          value={value}
          onChange={(e) => onChange(Math.max(min, parseInt(e.target.value) || min))}
          className={cn(
            'retro-input min-w-0 flex-1 px-3 py-2 text-center font-display text-lg tabular-nums',
            error && 'border-tomato-deep',
          )}
        />
        <RetroButton
          size="sm"
          onClick={() => onChange(value + step)}
          aria-label={`Increase ${label}`}
          className="h-11 w-11 shrink-0 px-0 text-xl"
        >
          +
        </RetroButton>
      </div>
      {error && <p className="mt-1 text-xs font-semibold text-tomato-deep">{error}</p>}
    </div>
  );
}

export default function CreateRoomPage() {
  useApiWarmUp();
  const navigate = useNavigate();
  const [startingStack, setStartingStack] = useState(1000);
  const [smallBlind, setSmallBlind] = useState(10);
  const [bigBlind, setBigBlind] = useState(20);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<PresetId | null>('standard');
  const [isCustomOpen, setIsCustomOpen] = useState(false);

  const apiUrl = import.meta.env.VITE_API_URL ?? '';

  const stackError = startingStack < bigBlind ? 'Stack must be at least the big blind' : null;
  const sbError = smallBlind >= bigBlind ? 'Small blind must be less than big blind' : null;
  const hasValidationError = !!(stackError || sbError);

  const handlePreset = (preset: typeof PRESETS[0]) => {
    setSelectedPreset(preset.id);
    setStartingStack(preset.stack);
    setSmallBlind(preset.sb);
    setBigBlind(preset.bb);
    setLocalError(null);
    setIsCustomOpen(false);
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasValidationError) return;
    setLoading(true);
    setLocalError(null);

    try {
      const request: CreateRoomRequest = { startingStack, smallBlind, bigBlind };
      const res = await fetch(`${apiUrl}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      const data: CreateRoomResponse = await res.json();
      if (data.success && data.roomCode) {
        navigate(`/room/${data.roomCode}/lobby`);
      } else {
        setLocalError(data.error || 'Failed to create room');
      }
    } catch (err) {
      setLocalError(`Failed to reach server: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 px-4 py-8">
      <ChipLogo />
      <p className="-mt-1 text-center font-display text-base text-ink-soft">2–9 players · No app required</p>

      <div className="retro-panel w-full max-w-md p-5">
        <h2 className="mb-3 font-display text-xl uppercase tracking-wide text-ink">Pick your stakes</h2>

        <div className="mb-5 grid grid-cols-3 gap-2.5">
          {PRESETS.map((p) => {
            const selected = selectedPreset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePreset(p)}
                aria-pressed={selected}
                className={cn(
                  'retro-btn relative flex-col gap-1 px-1 py-2.5 text-center',
                  selected ? 'bg-mustard text-ink' : 'bg-card text-ink',
                )}
              >
                {selected && (
                  <span aria-hidden="true" className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full border-2 border-ink bg-teal text-xs">
                    ✓
                  </span>
                )}
                <ChipStack count={p.chips} size={26} colorOffset={p.chips} />
                <span className="text-sm">{p.label}</span>
                <span className="font-sans text-[11px] font-semibold opacity-80">{p.desc}</span>
              </button>
            );
          })}
        </div>

        <form onSubmit={handleCreateRoom} className="space-y-5">
          <div>
            <button
              type="button"
              onClick={() => setIsCustomOpen(o => !o)}
              aria-expanded={isCustomOpen}
              className="mb-2 flex w-full items-center justify-between py-1 font-display text-sm uppercase tracking-wide text-ink-soft transition-colors hover:text-ink"
            >
              <span>Custom Setup</span>
              <ChevronDown
                aria-hidden="true"
                size={18}
                className={cn('transition-transform duration-200', isCustomOpen && 'rotate-180')}
              />
            </button>
            <div
              inert={!isCustomOpen}
              className={cn(
                'overflow-hidden transition-all duration-300',
                isCustomOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
              )}
            >
              <div className="space-y-4 px-1 pb-2">
                <StepperInput
                  id="startingStack"
                  label="Starting Stack"
                  value={startingStack}
                  onChange={(v) => { setStartingStack(v); setSelectedPreset(null); setIsCustomOpen(true); }}
                  min={100}
                  step={100}
                  error={stackError}
                />
                <div className="grid grid-cols-2 gap-3">
                  <StepperInput
                    id="smallBlind"
                    label="Small Blind"
                    value={smallBlind}
                    onChange={(v) => { setSmallBlind(v); setBigBlind(v * 2); setSelectedPreset(null); setIsCustomOpen(true); }}
                    min={1}
                    step={5}
                    error={sbError}
                  />
                  <StepperInput
                    id="bigBlind"
                    label="Big Blind"
                    value={bigBlind}
                    onChange={(v) => { setBigBlind(v); setSelectedPreset(null); setIsCustomOpen(true); }}
                    min={2}
                    step={5}
                  />
                </div>
              </div>
            </div>
          </div>

          {localError && (
            <div role="alert" className="animate-shake rounded-xl border-[3px] border-ink bg-tomato-deep px-4 py-3 text-sm font-semibold text-paper">
              {localError}
            </div>
          )}

          <RetroButton
            type="submit"
            tone="teal"
            size="xl"
            block
            disabled={loading || hasValidationError}
            className="uppercase"
          >
            {loading ? 'Creating...' : 'Create Game'}
          </RetroButton>
        </form>
      </div>

      <ol className="grid w-full max-w-md grid-cols-3 gap-2.5">
        {HOW_IT_WORKS.map(step => (
          <li key={step.n} className="flex flex-col items-center gap-1 rounded-xl border-[3px] border-ink bg-card px-2 py-2.5 text-center shadow-hard-sm">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-ink font-display text-sm text-paper">{step.n}</span>
            <span className="text-xs font-semibold leading-tight text-ink">{step.text}</span>
          </li>
        ))}
      </ol>

      <p className="text-center text-sm font-medium text-ink-soft">
        Have a room code?{' '}
        <Link to="/join" className="font-display text-royal underline decoration-2 underline-offset-2 hover:text-ink">
          Join a game
        </Link>
      </p>
    </div>
  );
}
