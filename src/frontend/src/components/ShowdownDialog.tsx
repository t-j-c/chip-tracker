import type { GameState } from '../types/game';

interface ShowdownDialogProps {
  gameState: GameState;
  onSelectWinner: (winnerId: string) => void;
  onSplitPot: () => void;
}

export default function ShowdownDialog({ gameState, onSelectWinner, onSplitPot }: ShowdownDialogProps) {
  const activePlayers = gameState.players.filter(p => !p.hasFolded);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-sm">
        <h2 className="text-2xl font-bold mb-2 text-gray-800">Showdown</h2>
        <p className="text-gray-700 mb-4">Who won the hand?</p>
        <div className="space-y-2">
          {activePlayers.map(player => (
            <button
              key={player.playerId}
              onClick={() => onSelectWinner(player.playerId)}
              className="w-full bg-blue-500 text-white font-bold py-2 px-4 rounded hover:bg-blue-600"
            >
              {player.name} wins
            </button>
          ))}
          <button
            onClick={onSplitPot}
            className="w-full bg-gray-500 text-white font-bold py-2 px-4 rounded hover:bg-gray-600 mt-2"
          >
            Split Pot
          </button>
        </div>
      </div>
    </div>
  );
}
