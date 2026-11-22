import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DialogShellProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  children: ReactNode;
  ariaDescribedBy?: string;
  testId?: string;
  sizeClass?: string;
  showCloseButton?: boolean;
  isFixed?: boolean;
  centerTitle?: boolean;
  closeLabel?: string;
}

export function DialogShell({
  open = true,
  onOpenChange,
  title,
  children,
  ariaDescribedBy,
  testId,
  sizeClass = 'max-w-sm',
  showCloseButton = true,
  isFixed = false,
  centerTitle = false,
  closeLabel = 'Close dialog',
}: DialogShellProps) {
  return (
    <Dialog.Root open={open} onOpenChange={isFixed ? undefined : onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-fade-in fixed inset-0 z-50 bg-ink/60 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn('fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 outline-none', sizeClass)}
          aria-describedby={ariaDescribedBy}
          data-testid={testId}
        >
          <div className="retro-panel animate-pop-in max-h-[85dvh] overflow-y-auto p-5">
            <div className={cn('mb-4 flex items-start gap-3', centerTitle ? 'justify-center' : 'justify-between')}>
              <Dialog.Title className="inline-block -rotate-2 rounded-xl border-[3px] border-ink bg-mustard px-3 py-0.5 font-display text-2xl uppercase leading-tight tracking-wide text-ink shadow-hard-sm">
                {title}
              </Dialog.Title>
              {showCloseButton && !isFixed && (
                <Dialog.Close asChild>
                  <button
                    aria-label={closeLabel}
                    className="retro-btn h-10 w-10 shrink-0 bg-card text-ink"
                  >
                    <X aria-hidden="true" size={18} />
                  </button>
                </Dialog.Close>
              )}
            </div>
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
