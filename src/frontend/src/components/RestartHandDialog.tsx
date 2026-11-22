import { DialogShell } from './DialogShell';
import RetroButton from './ui/RetroButton';

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
      <p id="restart-hand-description" className="mb-5 text-sm text-ink-soft">
        Every bet made this hand goes back to the player who made it. The same dealer deals again
        and the blinds are re-posted. Players, stacks and seats are kept. This can't be undone.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <RetroButton tone="cream" onClick={onCancel}>
          Cancel
        </RetroButton>
        <RetroButton tone="tomato" data-testid="restart-hand-confirm" onClick={onConfirm}>
          Restart Hand
        </RetroButton>
      </div>
    </DialogShell>
  );
}
