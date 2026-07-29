import * as Dialog from '@radix-ui/react-dialog';

interface RebuyDialogProps {
  startingStack: number;
  onRebuy: () => void;
  onCashOut: () => void;
}

/** Blocking prompt shown to a player whose stack hit zero: buy back in or leave the table. */
export default function RebuyDialog({ startingStack, onRebuy, onCashOut }: RebuyDialogProps) {
  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm p-6 rounded-2xl bg-surface-elevated shadow-2xl"
          aria-describedby="rebuy-description"
          data-testid="rebuy-dialog"
        >
          <Dialog.Title className="text-2xl font-bold uppercase tracking-widest text-gold text-center mb-1">
            You're Out of Chips
          </Dialog.Title>
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
