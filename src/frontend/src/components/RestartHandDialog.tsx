import { DialogShell } from './DialogShell';

interface RestartHandDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
}

/** Room creator's confirmation before abandoning and re-dealing the current hand. */
export default function RestartHandDialog({ onConfirm, onCancel }: RestartHandDialogProps) {
  return (
    <DialogShell
      title="Restart Hand"
      testId="restart-hand-dialog"
      onOpenChange={(open) => !open && onCancel()}
      ariaDescribedBy="restart-hand-description"
    >
      <p id="restart-hand-description" className="text-text-secondary text-sm mb-5">
        Every bet made this hand goes back to the player who made it. The same dealer deals again
        and the blinds are re-posted. Players, stacks and seats are kept. This can't be undone.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="border-2 border-surface-card text-text-primary font-bold py-3 rounded-xl transition-all hover:bg-surface-card active:scale-95"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="restart-hand-confirm"
          onClick={onConfirm}
          className="bg-accent-danger text-white font-bold py-3 rounded-xl transition-all hover:opacity-90 active:scale-95"
        >
          Restart Hand
        </button>
      </div>
    </DialogShell>
  );
}
