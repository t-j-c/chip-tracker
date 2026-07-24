import { useState } from 'react';
import { PokerAction } from '../types/game';
import type { GameState } from '../types/game';

interface ActionBarProps {
  gameState: GameState | null;
  playerId: string | null;
  onAction: (action: PokerAction, amount?: number) => void;
  isYourTurn: boolean;
}

export default function ActionBar({ gameState, playerId, onAction, isYourTurn }: ActionBarProps) {
  const [raiseAmount, setRaiseAmount] = useState(0);

  if (!gameState || !playerId || !isYourTurn) {
    return (
      <div className="bg-gray-100 p-4 rounded-lg text-center text-gray-600">
        Waiting for your turn...
      </div>
    );
  }

  const player = gameState.players.find(p => p.playerId === playerId);
  if (!player) return null;

  const handleFold = () => onAction(PokerAction.Fold);
  const handleCheck = () => onAction(PokerAction.Check);
  const handleCall = () => onAction(PokerAction.Call);
  const handleBet = () => {
    const amount = prompt(`Enter bet amount (max ${player.stack}):`);
    if (amount) onAction(PokerAction.Bet, parseInt(amount));
  };
  const handleRaise = () => onAction(PokerAction.Raise, raiseAmount);
  const handleAllIn = () => onAction(PokerAction.AllIn);

  const canCheck = gameState.currentBet === player.currentBet;
  const hasOutstandingBet = gameState.currentBet > player.currentBet;

  return (
    <div className="bg-blue-50 p-4 rounded-lg border-2 border-blue-300">
      <p className="text-center font-bold mb-3 text-blue-900">Your Turn - Choose Action</p>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <button
          onClick={handleFold}
          className="bg-red-500 text-white font-bold py-2 px-3 rounded hover:bg-red-600"
        >
          Fold
        </button>

        {canCheck && (
          <button
            onClick={handleCheck}
            className="bg-green-500 text-white font-bold py-2 px-3 rounded hover:bg-green-600"
          >
            Check
          </button>
        )}

        {hasOutstandingBet && (
          <button
            onClick={handleCall}
            className="bg-blue-500 text-white font-bold py-2 px-3 rounded hover:bg-blue-600"
          >
            Call
          </button>
        )}

        <button
          onClick={handleBet}
          className="bg-orange-500 text-white font-bold py-2 px-3 rounded hover:bg-orange-600"
        >
          Bet
        </button>

        <button
          onClick={handleRaise}
          className="bg-purple-500 text-white font-bold py-2 px-3 rounded hover:bg-purple-600"
        >
          Raise
        </button>

        <button
          onClick={handleAllIn}
          className="bg-yellow-600 text-white font-bold py-2 px-3 rounded hover:bg-yellow-700"
        >
          All-In
        </button>
      </div>

      {gameState.currentBet > 0 && (
        <div className="mt-3 p-2 bg-white rounded">
          <label className="block text-sm font-semibold mb-1">Raise to:</label>
          <input
            type="number"
            value={raiseAmount}
            onChange={(e) => setRaiseAmount(parseInt(e.target.value))}
            min={gameState.currentBet + gameState.minRaise}
            max={player.stack + player.currentBet}
            className="w-full px-2 py-1 border border-gray-300 rounded"
          />
        </div>
      )}
    </div>
  );
}
