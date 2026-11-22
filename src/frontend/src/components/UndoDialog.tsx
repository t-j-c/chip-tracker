import { useEffect } from 'react';
import RetroButton from './ui/RetroButton';

const AUTO_DECLINE_MS = 15000;

interface UndoDialogProps {
  requestingPlayerName: string;
  onApprove: () => void;
  onDecline: () => void;
}

// GP-28: Slide-down banner instead of a blocking modal. Auto-declines after 15s (shown as a draining fuse).
export default function UndoDialog({ requestingPlayerName, onApprove, onDecline }: UndoDialogProps) {
  useEffect(() => {
    const timer = setTimeout(onDecline, AUTO_DECLINE_MS);
    return () => clearTimeout(timer);
  }, [onDecline]);

  return (
    <div
      role="alertdialog"
      data-testid="undo-dialog"
      aria-label="Undo request"
      aria-describedby="undo-banner-desc"
      className="animate-slide-down fixed inset-x-0 top-0 z-50 border-b-[3px] border-ink bg-mustard px-4 pb-3 shadow-hard"
      style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
    >
      <p id="undo-banner-desc" className="mb-2 font-display text-base text-ink">
        {requestingPlayerName} wants to undo the last action
      </p>
      <div aria-hidden="true" className="mb-2 h-2 overflow-hidden rounded-full border-2 border-ink bg-card">
        <div className="keep-visible-reduced animate-countdown h-full bg-tomato" style={{ animationDuration: `${AUTO_DECLINE_MS}ms` }} />
      </div>
      <div className="flex gap-2">
        <RetroButton tone="tomato" size="sm" className="flex-1" onClick={onDecline}>
          Decline
        </RetroButton>
        <RetroButton tone="teal" size="sm" className="flex-1" onClick={onApprove}>
          Approve
        </RetroButton>
      </div>
    </div>
  );
}
