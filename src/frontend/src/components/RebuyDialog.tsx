import { Coins } from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import { DialogShell } from './DialogShell';
import RetroButton from './ui/RetroButton';

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
      centerTitle
      ariaDescribedBy="rebuy-description"
    >
      <div aria-hidden="true" className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full border-[3px] border-ink bg-paper shadow-hard-sm">
        <Coins size={30} className="text-ink" />
      </div>
      <p id="rebuy-description" className="mb-5 text-center text-sm text-ink-soft">
        Buy back in for {formatMoney(startingStack)}, or cash out and leave the table.
      </p>
      <div className="space-y-3">
        <RetroButton block size="lg" tone="teal" data-testid="rebuy-confirm" onClick={onRebuy}>
          Buy In for {formatMoney(startingStack)}
        </RetroButton>
        <RetroButton block size="md" tone="cream" data-testid="rebuy-decline" onClick={onCashOut}>
          Cash Out
        </RetroButton>
      </div>
    </DialogShell>
  );
}
