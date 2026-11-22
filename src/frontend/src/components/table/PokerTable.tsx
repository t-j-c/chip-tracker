import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../../types/game';
import type { ActionBubbleInfo, PhaseSplashInfo, WinInfo } from '../../hooks/useTableEvents';
import { opponentsInSeatOrder } from '../../lib/seating';
import { chipCountForAmount } from '../../lib/chips';
import { HERO_BET_POINT, HERO_SEAT_POINT, POT_POINT, opponentLayout, type Point } from '../../lib/tableLayout';
import BoardCards from './BoardCards';
import CenterPot from './CenterPot';
import BetChip from './BetChip';
import ChipFlight from './ChipFlight';
import Seat from './Seat';
import PhaseSplash from './PhaseSplash';

export default function PokerTable({ gameState, playerId, bubbles, wins, splash }: {
  gameState: GameState;
  playerId: string | null;
  bubbles: Record<string, ActionBubbleInfo>;
  wins: Record<string, WinInfo>;
  splash: PhaseSplashInfo | null;
}) {
  const opponents = opponentsInSeatOrder(gameState.players, playerId);
  const layout = opponentLayout(opponents.length);
  const hero = gameState.players.find(p => p.playerId === playerId) ?? null;
  const seatIndexOf = (id: string) => gameState.players.findIndex(p => p.playerId === id);
  const seatPoint = (id: string): Point => {
    if (id === playerId) return HERO_SEAT_POINT;
    const i = opponents.findIndex(p => p.playerId === id);
    return i >= 0 ? layout[i].seat : POT_POINT;
  };
  const [payouts, setPayouts] = useState<{ key: number; to: Point; count: number }[]>([]);
  const seenWins = useRef(new Set<number>());
  useEffect(() => {
    const fresh = Object.entries(wins).filter(([, w]) => !seenWins.current.has(w.key));
    if (fresh.length === 0) return;
    fresh.forEach(([, w]) => seenWins.current.add(w.key));
    setPayouts(list => [...list, ...fresh.map(([id, w]) => ({
      key: w.key, to: seatPoint(id), count: chipCountForAmount(w.amount, gameState.bigBlind),
    }))]);
    // seatPoint and bigBlind are captured at the moment each win arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wins]);

  return (
    <div className="table-stage relative mx-auto h-full w-full max-w-[880px]" data-testid="poker-table">
      <div aria-hidden="true" className="felt table-rail absolute inset-x-[9%] inset-y-[7%] rounded-[50%]" />
      <div className="table-piece absolute left-1/2 top-[53%] z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5">
        <BoardCards phase={gameState.phase} />
        <CenterPot state={gameState} />
      </div>
      {opponents.map((p, i) => <BetChip key={`bet-${p.playerId}`} amount={p.currentBet} at={layout[i].bet} bigBlind={gameState.bigBlind} />)}
      {hero && <BetChip amount={hero.currentBet} at={HERO_BET_POINT} bigBlind={gameState.bigBlind} />}
      {opponents.map((p, i) => (
        <Seat
          key={p.playerId} player={p} at={layout[i].seat} colorIndex={seatIndexOf(p.playerId)}
          avatarSize={opponents.length > 4 ? 'md' : 'lg'}
          isActive={gameState.activePlayerTurnId === p.playerId}
          bubble={bubbles[p.playerId]} win={wins[p.playerId]}
        />
      ))}
      {payouts.map(p => (
        <ChipFlight key={`payout-${p.key}`} from={POT_POINT} to={p.to} count={p.count} onDone={() => setPayouts(list => list.filter(x => x.key !== p.key))} />
      ))}
      {splash && <PhaseSplash key={splash.key} title={splash.title} subtitle={splash.subtitle} />}
    </div>
  );
}
