import { useEffect, useRef, useState } from 'react';
import { POT_POINT, type Point } from '../../lib/tableLayout';
import { chipCountForAmount } from '../../lib/chips';
import { formatMoney } from '@/lib/utils';
import ChipStack from '../ui/ChipStack';
import ChipFlight from './ChipFlight';

export default function BetChip({ amount, at, bigBlind }: { amount: number; at: Point; bigBlind: number }) {
  const [flights, setFlights] = useState<{ key: number; amount: number }[]>([]);
  const prevAmount = useRef(amount);
  useEffect(() => {
    const before = prevAmount.current;
    prevAmount.current = amount;
    if (before > 0 && amount === 0) setFlights(list => [...list, { key: Date.now(), amount: before }]);
  }, [amount]);
  return (
    <>
      {amount > 0 && (
        <div className="table-piece pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: `${at.x}%`, top: `${at.y}%` }}>
          <div key={amount} className="animate-pop-in flex flex-col items-center">
            <ChipStack count={chipCountForAmount(amount, bigBlind)} size={18} />
            <span className="-mt-0.5 rounded-full border-2 border-ink bg-card px-1.5 font-display text-xs leading-4 text-ink shadow-hard-sm tabular-nums">{formatMoney(amount)}</span>
          </div>
        </div>
      )}
      {flights.map(f => <ChipFlight key={f.key} from={at} to={POT_POINT} count={chipCountForAmount(f.amount, bigBlind)} onDone={() => setFlights(list => list.filter(x => x.key !== f.key))} />)}
    </>
  );
}
