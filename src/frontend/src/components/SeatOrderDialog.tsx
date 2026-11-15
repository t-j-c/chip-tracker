import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { DialogShell } from './DialogShell';
import { moveSeat } from '../lib/seating';
import { cn, getAvatarColor } from '@/lib/utils';
import type { Player } from '../types/game';

interface SeatMoveButtonsProps {
  name: string;
  index: number;
  count: number;
  disabled?: boolean;
  onMove: (delta: -1 | 1) => void;
}

const MOVE_BTN =
  'p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors disabled:opacity-30 disabled:cursor-not-allowed';

/** Up/down controls for moving one player in the seating order. */
export function SeatMoveButtons({ name, index, count, disabled, onMove }: SeatMoveButtonsProps) {
  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={() => onMove(-1)}
        disabled={disabled || index === 0}
        aria-label={`Move ${name} up`}
        className={MOVE_BTN}
      >
        <ChevronUp size={18} />
      </button>
      <button
        type="button"
        onClick={() => onMove(1)}
        disabled={disabled || index === count - 1}
        aria-label={`Move ${name} down`}
        className={MOVE_BTN}
      >
        <ChevronDown size={18} />
      </button>
    </div>
  );
}

interface SeatOrderDialogProps {
  /** Players in the current table order. */
  players: Player[];
  /** Order already queued for the next hand, if any. */
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
  const changed = order.some((id, i) => id !== initial[i]);

  return (
    <DialogShell
      title="Seating"
      testId="seat-order-dialog"
      onOpenChange={(open) => !open && onClose()}
      ariaDescribedBy="seat-order-description"
    >
      <p id="seat-order-description" className="text-text-secondary text-sm mb-4">
        List players clockwise around the table. The new order starts with the next hand, and the
        dealer button stays with the same player.
      </p>
      <ol className="space-y-2 mb-5">
        {order.map((id, idx) => {
          const player = byId.get(id);
          if (!player) return null;
          return (
            <li
              key={id}
              data-testid={`seat-row-${id}`}
              className="flex items-center gap-3 pl-3 pr-1 py-2 bg-surface-card rounded-xl"
            >
              <span className="w-4 text-xs text-text-secondary font-mono">{idx + 1}</span>
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-sm flex-shrink-0',
                  getAvatarColor(idx),
                )}
              >
                {player.name.charAt(0).toUpperCase()}
              </div>
              <span className="flex-1 min-w-0 font-medium text-text-primary truncate">{player.name}</span>
              {player.isDealer && (
                <span
                  className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold bg-accent-warning text-text-on-light"
                  aria-label="Dealer"
                >
                  D
                </span>
              )}
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
        <button
          type="button"
          onClick={onClose}
          className="border-2 border-surface-card text-text-primary font-bold py-3 rounded-xl transition-all hover:bg-surface-card active:scale-95"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="seat-order-save"
          onClick={() => onSave(order)}
          disabled={!changed}
          className="bg-accent-primary text-white font-bold py-3 rounded-xl transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save
        </button>
      </div>
    </DialogShell>
  );
}
