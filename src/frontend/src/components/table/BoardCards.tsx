const DEALT: Record<string, number> = { PreFlop: 0, Flop: 3, Turn: 4, River: 5, Showdown: 5 };
const LABELS: Record<string, string> = { PreFlop: 'Pre-Flop', Flop: 'Flop', Turn: 'Turn', River: 'River', Showdown: 'Showdown' };

export default function BoardCards({ phase }: { phase: string }) {
  const dealt = DEALT[phase] ?? 0;
  return (
    <div className="flex flex-col items-center gap-1">
      <div aria-hidden="true" className="flex gap-[3px]">
        {[0, 1, 2, 3, 4].map(i =>
          i < dealt ? (
            <span key={`card-${i}`} className="card-back animate-deal-in h-8 w-[22px] rounded-[5px] border-2 border-ink shadow-hard-sm" style={{ animationDelay: `${i < 3 ? i * 60 : 0}ms` }} />
          ) : (
            <span key={`slot-${i}`} className="h-8 w-[22px] rounded-[5px] border-2 border-dashed border-paper/45" />
          ),
        )}
      </div>
      <span className="rounded-full border-2 border-ink bg-ink px-2.5 py-px font-display text-[11px] uppercase leading-4 tracking-widest text-paper">{LABELS[phase] ?? phase}</span>
      <span className="sr-only" data-testid="phase-indicator" aria-live="polite">{phase}</span>
    </div>
  );
}
