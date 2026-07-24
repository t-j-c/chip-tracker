import type { Player } from '../types/game';

interface PlayerPanelProps {
  player: Player;
  isActivePlayer: boolean;
}

export default function PlayerPanel({ player, isActivePlayer }: PlayerPanelProps) {
  return (
    <div
      className={`p-4 rounded-lg border-2 ${
        isActivePlayer ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300 bg-gray-50'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="font-bold text-lg">{player.name}</h3>
          {player.isDealer && <span className="text-xs bg-blue-200 px-2 py-1 rounded">Dealer</span>}
        </div>
        {isActivePlayer && <div className="text-2xl animate-pulse">🟡</div>}
      </div>

      <div className="space-y-1 text-sm">
        <p>
          <span className="font-semibold">Stack:</span> {player.stack}
        </p>
        <p>
          <span className="font-semibold">Bet:</span> {player.currentBet}
        </p>
        {player.hasFolded && <p className="text-red-600 font-semibold">Folded</p>}
        {player.isAllIn && <p className="text-orange-600 font-semibold">All In</p>}
      </div>
    </div>
  );
}
