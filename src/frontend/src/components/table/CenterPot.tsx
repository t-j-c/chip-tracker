import type { GameState } from '../../types/game';
import { useAnimatedNumber } from '../../hooks/useAnimatedNumber';
import { chipCountForAmount } from '../../lib/chips';
import { formatMoney } from '@/lib/utils';
import ChipStack from '../ui/ChipStack';

export default function CenterPot({ state }: { state: GameState }) {
  const animatedPot = useAnimatedNumber(state.pot);
  const pots = state.pots ?? [];
  const hasSidePots = pots.length > 1;
  return (
    <div className="flex flex-col items-center">
      <div className="relative flex flex-col items-center rounded-2xl border-[3px] border-ink bg-card px-3 pb-0.5 pt-1 shadow-hard">
        <ChipStack count={Math.max(1, chipCountForAmount(state.pot, state.bigBlind))} size={22} colorOffset={2} className="absolute -left-4 -top-3" />
        <span className="text-[10px] font-semibold uppercase leading-3 tracking-[0.2em] text-ink-soft">Pot</span>
        <span data-testid="pot-amount" className="font-display text-2xl leading-7 text-ink tabular-nums">{formatMoney(animatedPot)}</span>
      </div>
      {hasSidePots && (
        <div data-testid="pot-breakdown" className="mt-1 flex max-w-[200px] flex-wrap justify-center gap-1">
          {pots.map((p, i) => (
            <span key={i} className="rounded-full border-2 border-ink bg-mustard px-1.5 text-[11px] font-semibold leading-4 text-ink">
              {i === 0 ? 'Main Pot' : `Side Pot ${i}`}: {formatMoney(p.amount)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
