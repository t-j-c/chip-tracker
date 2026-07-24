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
  const [betAmount, setBetAmount] = useState<number>(0);
  const [raiseAmount, setRaiseAmount] = useState<number>(0);

  if (!gameState || !playerId || !isYourTurn) {
    return (
      <div className="bg-gray-100 p-4 rounded-lg text-center text-gray-600">
        Waiting for your turn...
      </div>
    );
  }

  const player = gameState.players.find(p => p.playerId === playerId);
  if (!player) return null;

  const canCheck = gameState.currentBet === player.currentBet;
  const hasOutstandingBet = gameState.currentBet > player.currentBet;
  const canBet = gameState.currentBet === 0;
  const canRaise = gameState.currentBet > 0;

  const minBet = gameState.bigBlind;
  const maxBet = player.stack;
  const minRaiseTo = gameState.currentBet + gameState.minRaise;
  const maxRaiseTo = player.stack + player.currentBet;

  // Initialize amounts lazily to valid defaults when the bet context changes
  const effectiveBetAmount = betAmount > 0 ? betAmount : minBet;
  const effectiveRaiseAmount = raiseAmount >= minRaiseTo ? raiseAmount : minRaiseTo;

  const handleFold = () => onAction(PokerAction.Fold);
  const handleCheck = () => onAction(PokerAction.Check);
  const handleCall = () => onAction(PokerAction.Call);
  const handleBet = () => onAction(PokerAction.Bet, effectiveBetAmount);
  const handleRaise = () => onAction(PokerAction.Raise, effectiveRaiseAmount);
  const handleAllIn = () => onAction(PokerAction.AllIn);

  return (
    <div className="bg-blue-50 p-4 rounded-lg border-2 border-blue-300">
      <p className="text-center font-bold mb-3 text-blue-900">Your Turn - Choose Action</p>

      <div className="grid grid-cols-3 gap-2 mb-3">
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
            Call ${gameState.currentBet - player.currentBet}
          </button>
        )}

        {canBet && (
          <button
            onClick={handleBet}
            className="bg-orange-500 text-white font-bold py-2 px-3 rounded hover:bg-orange-600"
          >
            Bet
          </button>
        )}

        {canRaise && (
          <button
            onClick={handleRaise}
            className="bg-purple-500 text-white font-bold py-2 px-3 rounded hover:bg-purple-600"
          >
            Raise
          </button>
        )}

        <button
          onClick={handleAllIn}
          className="bg-yellow-600 text-white font-bold py-2 px-3 rounded hover:bg-yellow-700"
        >
          All-In
        </button>
      </div>

      {canBet && (
        <div className="mt-2 p-3 bg-white rounded border">
          <label className="block text-sm font-semibold mb-1 text-gray-700">
            Bet amount (min ${minBet}, max ${maxBet}):
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              value={effectiveBetAmount}
              onChange={(e) => setBetAmount(Math.max(minBet, Math.min(maxBet, parseInt(e.target.value) || minBet)))}
              min={minBet}
              max={maxBet}
              className="flex-1 px-2 py-1 border border-gray-300 rounded"
            />
            <button
              onClick={handleBet}
              className="bg-orange-500 text-white font-bold py-1 px-3 rounded hover:bg-orange-600 text-sm"
            >
              Confirm Bet
            </button>
          </div>
        </div>
      )}

      {canRaise && (
        <div className="mt-2 p-3 bg-white rounded border">
          <label className="block text-sm font-semibold mb-1 text-gray-700">
            Raise to (min ${minRaiseTo}, max ${maxRaiseTo}):
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              value={effectiveRaiseAmount}
              onChange={(e) => setRaiseAmount(Math.max(minRaiseTo, Math.min(maxRaiseTo, parseInt(e.target.value) || minRaiseTo)))}
              min={minRaiseTo}
              max={maxRaiseTo}
              className="flex-1 px-2 py-1 border border-gray-300 rounded"
            />
            <button
              onClick={handleRaise}
              className="bg-purple-500 text-white font-bold py-1 px-3 rounded hover:bg-purple-600 text-sm"
            >
              Confirm Raise
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
