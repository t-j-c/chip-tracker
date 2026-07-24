import type { GameState } from '../types/game';

interface PotDisplayProps {
  state: GameState;
}

export default function PotDisplay({ state }: PotDisplayProps) {
  return (
    <div className="bg-green-800 text-white p-6 rounded-lg text-center">
      <h2 className="text-sm font-semibold uppercase tracking-wide mb-2">Pot</h2>
      <p className="text-4xl font-bold mb-4">${state.pot}</p>
      <p className="text-lg font-semibold">
        Phase: <span className="text-yellow-300">{state.phase}</span>
      </p>
      {state.isHandActive && <p className="text-sm text-green-200 mt-2">Hand in progress</p>}
    </div>
  );
}
