import { useEffect } from 'react';

interface UndoDialogProps {
  requestingPlayerName: string;
  onApprove: () => void;
  onDecline: () => void;
}

// GP-28: Slide-down banner instead of a blocking modal. Auto-declines after 15s.
export default function UndoDialog({ requestingPlayerName, onApprove, onDecline }: UndoDialogProps) {
  useEffect(() => {
    const timer = setTimeout(onDecline, 15000);
    return () => clearTimeout(timer);
  }, [onDecline]);

  return (
    <div
      role="alertdialog"
      aria-label="Undo request"
      aria-describedby="undo-banner-desc"
      className="animate-slide-down fixed top-0 left-0 right-0 z-50 bg-surface-elevated border-b border-surface-card shadow-lg px-4 py-3"
    >
      <p id="undo-banner-desc" className="text-sm text-text-primary font-semibold mb-2">
        {requestingPlayerName} wants to undo the last action
      </p>
      <div className="flex gap-2">
        <button
          onClick={onDecline}
          className="flex-1 bg-accent-danger text-white font-bold py-2 px-3 rounded-xl hover:bg-accent-danger/90 active:scale-95 transition-all text-sm"
        >
          Decline
        </button>
        <button
          onClick={onApprove}
          className="flex-1 bg-accent-primary text-white font-bold py-2 px-3 rounded-xl hover:bg-accent-primary/90 active:scale-95 transition-all text-sm"
        >
          Approve
        </button>
      </div>
    </div>
  );
}
