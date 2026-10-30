import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'

interface DialogShellProps {
  /** Whether the dialog is open. */
  open?: boolean
  /** Called when open state changes (triggered by close button, overlay click, etc). */
  onOpenChange?: (open: boolean) => void
  /** Dialog title. */
  title: string
  /** Dialog content. */
  children: ReactNode
  /** Optional description for aria-describedby. */
  ariaDescribedBy?: string
  /** Optional test ID. */
  testId?: string
  /** Optional size class. Defaults to max-w-sm (medium). */
  sizeClass?: string
  /** Whether to show a close button. Defaults to true. */
  showCloseButton?: boolean
  /** Whether to use a fixed open state (no close button interaction). Defaults to false. */
  isFixed?: boolean
}

/**
 * Shared Radix dialog shell for consistent modal styling and behavior.
 * Encapsulates overlay, content, title, and close button patterns.
 */
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
}: DialogShellProps) {
  return (
    <Dialog.Root open={open} onOpenChange={isFixed ? undefined : onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" />
        <Dialog.Content
          className={`fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full ${sizeClass} p-6 rounded-2xl bg-surface-elevated shadow-2xl`}
          aria-describedby={ariaDescribedBy}
          data-testid={testId}
        >
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-2xl font-bold uppercase tracking-widest text-gold">
              {title}
            </Dialog.Title>
            {showCloseButton && !isFixed && (
              <Dialog.Close asChild>
                <button
                  aria-label="Close dialog"
                  className="rounded-md hover:bg-surface-card p-1 text-text-secondary hover:text-text-primary transition-all"
                >
                  ✕
                </button>
              </Dialog.Close>
            )}
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
