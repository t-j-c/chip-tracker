import type { GamePhase } from '@/types/game';
import { cn } from '@/lib/utils';

const PHASES: GamePhase[] = ['PreFlop', 'Flop', 'Turn', 'River', 'Showdown'];

interface PhaseStepperProps {
  phase: GamePhase;
}

export default function PhaseStepper({ phase }: PhaseStepperProps) {
  const currentIndex = PHASES.indexOf(phase);

  return (
    <div className="flex items-center justify-center gap-1 px-2 py-2">
      {PHASES.map((p, i) => {
        const isActive = i === currentIndex;
        const isCompleted = i < currentIndex;
        return (
          <div key={p} className="flex items-center gap-1">
            <span
              className={cn(
                'text-xs font-semibold px-2 py-0.5 rounded-full transition-all duration-300',
                isActive && 'bg-accent-primary text-white scale-110',
                isCompleted && 'text-text-secondary',
                !isActive && !isCompleted && 'text-surface-elevated'
              )}
            >
              {p}
            </span>
            {i < PHASES.length - 1 && (
              <span
                className={cn(
                  'w-3 h-px',
                  isCompleted ? 'bg-text-secondary' : 'bg-surface-elevated'
                )}
              />
            )}
          </div>
        );
      })}
      {/* Hidden element for E2E: phase text for waitForPhase() */}
      <span
        className="sr-only"
        data-testid="phase-indicator"
        aria-live="polite"
      >
        {phase}
      </span>
    </div>
  );
}
