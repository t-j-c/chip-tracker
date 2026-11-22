import { Megaphone, ChevronRight } from 'lucide-react'
import { formatActivityEntry } from '@/lib/activityFormat'
import type { ActivityEntry } from '@/types/game'

interface ActivityStripProps {
  entries: ActivityEntry[]
  onOpenHistory: () => void
}

export function ActivityStrip({ entries, onOpenHistory }: ActivityStripProps) {
  // Find the most recent non-undone entry
  const mostRecentEntry = entries.findLast((entry) => !entry.isUndone)

  // Don't show the strip if there are no non-undone entries
  if (!mostRecentEntry) {
    return null
  }

  return (
    <button
      data-testid="activity-strip"
      onClick={onOpenHistory}
      aria-label="Activity history"
      className="flex w-full shrink-0 items-center gap-2 border-y-[3px] border-ink bg-mustard px-3 py-1.5 text-left text-ink transition-[filter] hover:brightness-105"
    >
      <Megaphone aria-hidden="true" size={16} className="shrink-0 -rotate-12" />
      <span key={mostRecentEntry.sequence} data-testid="activity-strip-text" className="animate-slide-in min-w-0 flex-1 truncate text-sm font-semibold">
        {formatActivityEntry(mostRecentEntry)}
      </span>
      <ChevronRight aria-hidden="true" size={16} className="shrink-0" />
    </button>
  )
}
