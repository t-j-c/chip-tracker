import type { CSSProperties } from 'react';
import type { Point } from '../../lib/tableLayout';
import ChipStack from '../ui/ChipStack';

export default function ChipFlight({ from, to, count, onDone }: { from: Point; to: Point; count: number; onDone: () => void }) {
  const style = {
    '--from-x': `${from.x}%`, '--from-y': `${from.y}%`, '--to-x': `${to.x}%`, '--to-y': `${to.y}%`,
    left: `${from.x}%`, top: `${from.y}%`,
  } as CSSProperties;
  return (
    <div aria-hidden="true" className="animate-chip-flight pointer-events-none absolute z-30" style={style} onAnimationEnd={onDone}>
      <ChipStack count={count} size={24} />
    </div>
  );
}
