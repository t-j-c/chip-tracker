import type { GameState } from '../types/game';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';

interface PotDisplayProps {
  state: GameState;
}

export default function PotDisplay({ state }: PotDisplayProps) {
  const callAmount = state.currentBet;
  const animatedPot = useAnimatedNumber(state.pot);
  const pots = state.pots ?? [];
  const hasSidePots = pots.length > 1;

  return (
    <div
      className="rounded-xl p-4 text-center"
      style={{ background: 'radial-gradient(ellipse at center, #1B5E3B 0%, #0F2D1C 100%)' }}
    >
      <div className="text-xs uppercase tracking-widest text-green-300 font-semibold mb-1">Pot</div>
      <div
        className="font-mono text-5xl font-bold text-white leading-tight"
        data-testid="pot-amount"
      >
        ${animatedPot.toLocaleString()}
      </div>
      {state.isHandActive && callAmount > 0 && (
        <div className="text-sm text-green-200 mt-2">
          Bet to call: <span className="text-white font-semibold">${callAmount.toLocaleString()}</span>
        </div>
      )}
      {hasSidePots && (
        <div className="text-xs text-green-200 mt-2 space-y-0.5" data-testid="pot-breakdown">
          {pots.map((p, i) => (
            <div key={i}>
              {i === 0 ? 'Main Pot' : `Side Pot ${i}`}: ${p.amount.toLocaleString()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
