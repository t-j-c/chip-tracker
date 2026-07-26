import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import type { CreateRoomRequest, CreateRoomResponse } from '../types/game';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import ChipLogo from '../components/ChipLogo';

type PresetId = 'casual' | 'standard' | 'deep';

const PRESETS: { id: PresetId; label: string; stack: number; sb: number; bb: number; desc: string }[] = [
  { id: 'casual',   label: 'Casual',     stack: 1000, sb: 5,  bb: 10, desc: '1,000 · 5/10' },
  { id: 'standard', label: 'Standard',   stack: 1000, sb: 10, bb: 20, desc: '1,000 · 10/20' },
  { id: 'deep',     label: 'Deep Stack', stack: 5000, sb: 25, bb: 50, desc: '5,000 · 25/50' },
];

export default function CreateRoomPage() {
  const navigate = useNavigate();
  const [startingStack, setStartingStack] = useState(1000);
  const [smallBlind, setSmallBlind] = useState(10);
  const [bigBlind, setBigBlind] = useState(20);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<PresetId | null>('standard');
  // CR-4: collapsible custom form — collapsed when preset is active
  const [isCustomOpen, setIsCustomOpen] = useState(false);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  // Inline validation errors
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

  function StepperInput({
    id,
    label,
    value,
    onChange,
    min = 1,
    step = 5,
    error,
  }: {
    id: string;
    label: string;
    value: number;
    onChange: (v: number) => void;
    min?: number;
    step?: number;
    error?: string | null;
  }) {
    return (
      <div>
        <label htmlFor={id} className="block text-sm font-semibold text-text-secondary mb-2">
          {label}
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange(Math.max(min, value - step))}
            className="w-11 h-11 rounded-xl bg-surface-elevated text-text-primary font-bold text-xl hover:bg-surface-card transition-colors active:scale-95 flex items-center justify-center"
            aria-label={`Decrease ${label}`}
          >
            −
          </button>
          <input
            id={id}
            type="number"
            inputMode="numeric"
            min={min}
            value={value}
            onChange={(e) => { onChange(Math.max(min, parseInt(e.target.value) || min)); setSelectedPreset(null); }}
            className={cn(
              'flex-1 text-center px-3 py-2.5 rounded-xl bg-surface-elevated text-text-primary font-mono font-bold text-lg border focus:outline-none transition-colors',
              error ? 'border-accent-danger ring-2 ring-accent-danger/40 focus:border-accent-danger' : 'border-surface-card focus:border-accent-primary'
            )}
          />
          <button
            type="button"
            onClick={() => onChange(value + step)}
            className="w-11 h-11 rounded-xl bg-surface-elevated text-text-primary font-bold text-xl hover:bg-surface-card transition-colors active:scale-95 flex items-center justify-center"
            aria-label={`Increase ${label}`}
          >
            +
          </button>
        </div>
        {error && <p className="text-accent-danger text-xs mt-1">{error}</p>}
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-surface-bg flex items-center justify-center p-4">
      <div className="bg-surface-card rounded-2xl shadow-2xl p-8 w-full max-w-md border border-surface-elevated">
        <ChipLogo />
        <p className="text-center text-text-secondary text-sm -mt-6 mb-6">2–9 players · No app required</p>

        {/* Quick-start presets */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handlePreset(p)}
              className={cn(
                'flex flex-col items-center py-3 px-2 rounded-xl border-2 transition-all active:scale-95 text-center',
                selectedPreset === p.id
                  ? 'border-accent-primary bg-accent-primary/10 text-text-primary'
                  : 'border-surface-elevated bg-surface-elevated text-text-secondary hover:border-accent-primary/50 hover:text-text-primary'
              )}
            >
              <span className="font-bold text-sm">{p.label}</span>
              <span className="text-[10px] font-mono mt-0.5 opacity-75">{p.desc}</span>
            </button>
          ))}
        </div>

        <form onSubmit={handleCreateRoom} className="space-y-5">
          {/* CR-4: collapsible custom setup */}
          <div>
            <button
              type="button"
              onClick={() => setIsCustomOpen(o => !o)}
              className="flex items-center justify-between w-full text-sm font-semibold text-text-secondary mb-2 hover:text-text-primary transition-colors py-1"
            >
              <span>Custom Setup</span>
              <ChevronDown
                size={16}
                className={cn('transition-transform duration-200', isCustomOpen && 'rotate-180')}
              />
            </button>
            <div
              className={cn(
                'overflow-hidden transition-all duration-300',
                isCustomOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
              )}
            >
              <div className="space-y-5 pb-1">
                <StepperInput
                  id="startingStack"
                  label="Starting Stack"
                  value={startingStack}
                  onChange={(v) => { setStartingStack(v); setSelectedPreset(null); setIsCustomOpen(true); }}
                  min={100}
                  step={100}
                  error={stackError}
                />
                <div className="grid grid-cols-2 gap-4">
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
            <div className="bg-accent-danger/20 border border-accent-danger/50 text-accent-danger px-4 py-3 rounded-xl text-sm">
              {localError}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || hasValidationError}
            className={cn(
              'w-full bg-accent-primary text-white font-bold py-4 rounded-xl text-base active:scale-95 transition-all',
              (loading || hasValidationError) ? 'opacity-70 cursor-not-allowed' : 'hover:bg-accent-primary/90'
            )}
          >
            {loading ? 'Creating...' : 'Create Game'}
          </button>
        </form>

        <p className="text-center text-text-secondary text-sm mt-6">
          Have a room code?{' '}
          <Link to="/join" className="text-accent-primary font-semibold hover:underline">
            Join a game
          </Link>
        </p>
      </div>
    </div>
  );
}
