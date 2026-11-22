import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { DialogShell } from './DialogShell';
import { moveSeat } from '../lib/seating';
import type { Player } from '../types/game';
import Avatar from './ui/Avatar';
import DealerChip from './ui/DealerChip';
import RetroButton from './ui/RetroButton';

interface SeatMoveButtonsProps {
  name: string;
  index: number;
  count: number;
  disabled?: boolean;
  onMove: (delta: -1 | 1) => void;
}

const MOVE_BTN = 'retro-btn h-9 w-9 bg-card text-ink shadow-hard-sm';

/** Up/down controls for moving one player in the seating order. */
export function SeatMoveButtons({ name, index, count, disabled, onMove }: SeatMoveButtonsProps) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onMove(-1)}
        disabled={disabled || index === 0}
        aria-label={`Move ${name} up`}
        className={MOVE_BTN}
      >
        <ChevronUp aria-hidden="true" size={18} />
      </button>
      <button
        type="button"
        onClick={() => onMove(1)}
        disabled={disabled || index === count - 1}
        aria-label={`Move ${name} down`}
        className={MOVE_BTN}
      >
        <ChevronDown aria-hidden="true" size={18} />
      </button>
    </div>
  );
}

interface SeatOrderDialogProps {
  players: Player[];
  pendingOrder?: string[] | null;
  onSave: (orderedPlayerIds: string[]) => void;
  onClose: () => void;
}

/** Room creator's in-game editor for the clockwise seating order. */
export default function SeatOrderDialog({ players, pendingOrder, onSave, onClose }: SeatOrderDialogProps) {
  const [initial] = useState(() =>
    pendingOrder && pendingOrder.length === players.length ? pendingOrder : players.map(p => p.playerId),
  );
  const [order, setOrder] = useState<string[]>(initial);
  const byId = new Map(players.map(p => [p.playerId, p]));
  const seatIndexOf = (id: string) => players.findIndex(p => p.playerId === id);
  const changed = order.some((id, i) => id !== initial[i]);

  return (
    <DialogShell
      title="Seating"
      testId="seat-order-dialog"
      onOpenChange={(open) => !open && onClose()}
      ariaDescribedBy="seat-order-description"
    >
      <p id="seat-order-description" className="mb-4 text-sm text-ink-soft">
        List players clockwise around the table. The new order starts with the next hand, and the
        dealer button stays with the same player.
      </p>
      <ol className="mb-5 space-y-2">
        {order.map((id, idx) => {
          const player = byId.get(id);
          if (!player) return null;
          return (
            <li
              key={id}
              data-testid={`seat-row-${id}`}
              className="flex items-center gap-2.5 rounded-xl border-[3px] border-ink bg-paper py-1.5 pl-2 pr-1.5 shadow-hard-sm"
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink font-display text-xs text-paper">
                {idx + 1}
              </span>
              <Avatar name={player.name} colorIndex={seatIndexOf(id)} size="sm" />
              <span className="min-w-0 flex-1 truncate font-display text-ink">{player.name}</span>
              {player.isDealer && <DealerChip variant="puck" />}
              <SeatMoveButtons
                name={player.name}
                index={idx}
                count={order.length}
                onMove={(delta) => setOrder(o => moveSeat(o, idx, delta))}
              />
            </li>
          );
        })}
      </ol>
      <div className="grid grid-cols-2 gap-3">
        <RetroButton tone="cream" onClick={onClose}>
          Cancel
        </RetroButton>
        <RetroButton tone="teal" data-testid="seat-order-save" onClick={() => onSave(order)} disabled={!changed}>
          Save
        </RetroButton>
      </div>
    </DialogShell>
  );
}
