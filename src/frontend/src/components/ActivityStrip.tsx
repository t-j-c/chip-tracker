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

  const formattedText = formatActivityEntry(mostRecentEntry)

  return (
    <button
      data-testid="activity-strip"
      onClick={onOpenHistory}
      aria-label="Activity history"
      className="w-full bg-accent-info/20 border-b border-accent-info/40 px-4 py-2 flex items-center justify-center gap-2 hover:bg-accent-info/30 transition-colors"
    >
      <span data-testid="activity-strip-text" className="text-sm text-accent-info font-semibold">
        {formattedText}
      </span>
    </button>
  )
}
