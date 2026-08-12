import { DialogShell } from './DialogShell';

interface RebuyDialogProps {
  startingStack: number;
  onRebuy: () => void;
  onCashOut: () => void;
}

/** Blocking prompt shown to a player whose stack hit zero: buy back in or leave the table. */
export default function RebuyDialog({ startingStack, onRebuy, onCashOut }: RebuyDialogProps) {
  return (
    <DialogShell
      isFixed={true}
      title="You're Out of Chips"
      testId="rebuy-dialog"
      showCloseButton={false}
      ariaDescribedBy="rebuy-description"
    >
      <p id="rebuy-description" className="text-text-secondary text-center text-sm mb-5">
        Buy back in for ${startingStack.toLocaleString()}, or cash out and leave the table.
      </p>
      <div className="space-y-3">
        <button
          data-testid="rebuy-confirm"
          onClick={onRebuy}
          className="w-full bg-accent-primary text-white font-bold py-4 px-4 rounded-xl transition-all hover:opacity-90 active:scale-95"
        >
          Buy In for ${startingStack.toLocaleString()}
        </button>
        <button
          data-testid="rebuy-decline"
          onClick={onCashOut}
          className="w-full border-2 border-surface-card text-text-primary font-bold py-3 px-4 rounded-xl transition-all hover:bg-surface-card active:scale-95"
        >
          Cash Out
        </button>
      </div>
    </DialogShell>
  );
}
