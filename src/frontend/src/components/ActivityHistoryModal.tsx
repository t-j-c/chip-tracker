import { useEffect, useState, useRef } from 'react'
import { formatActivityEntry } from '@/lib/activityFormat'
import { cn } from '@/lib/utils'
import type { ActivityEntry } from '@/types/game'
import { DialogShell } from './DialogShell'

interface ActivityHistoryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  roomCode: string
  fallbackEntries: ActivityEntry[]
}

interface GroupedEntries {
  handNumber: number
  entries: ActivityEntry[]
}

const DOT_BY_ACTION: Record<string, string> = {
  Fold: 'bg-tomato',
  Check: 'bg-teal',
  Call: 'bg-royal',
  Bet: 'bg-mustard',
  Raise: 'bg-mustard',
  AllIn: 'bg-grape',
}

function dotClass(entry: ActivityEntry): string {
  if (entry.entryType === 'PlayerAction' && entry.action) return DOT_BY_ACTION[entry.action] ?? 'bg-card'
  if (entry.entryType === 'PotWon') return 'bg-mustard'
  return 'bg-card'
}

export function ActivityHistoryModal({
  open,
  onOpenChange,
  roomCode,
  fallbackEntries,
}: ActivityHistoryModalProps) {
  const [entries, setEntries] = useState<ActivityEntry[]>(fallbackEntries)
  const [loading, setLoading] = useState(false)
  const fallbackEntriesRef = useRef(fallbackEntries)

  useEffect(() => {
    fallbackEntriesRef.current = fallbackEntries
  }, [fallbackEntries])

  useEffect(() => {
    if (!open) {
      return
    }

    setLoading(true)
    const apiUrl = import.meta.env.VITE_API_URL ?? ''
    fetch(`${apiUrl}/api/rooms/${roomCode}/activity`)
      .then((res) => res.json())
      .then((data) => {
        setEntries(data.entries || [])
      })
      .catch(() => {
        setEntries(fallbackEntriesRef.current)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [open, roomCode])

  const grouped: GroupedEntries[] = []
  const handMap = new Map<number, ActivityEntry[]>()

  for (const entry of entries) {
    const handNum = entry.handNumber ?? 0
    if (!handMap.has(handNum)) {
      handMap.set(handNum, [])
    }
    handMap.get(handNum)!.push(entry)
  }

  Array.from(handMap.entries())
    .sort(([a], [b]) => b - a)
    .forEach(([handNumber, handEntries]) => {
      grouped.push({
        handNumber,
        entries: handEntries.reverse(),
      })
    })

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Activity History"
      testId="activity-history-modal"
      sizeClass="max-w-lg"
      closeLabel="Close activity history"
    >
      {loading && (
        <div className="py-4 text-center font-display text-ink-soft">
          Loading activity history...
        </div>
      )}

      {!loading && entries.length === 0 && (
        <div className="py-4 text-center text-ink-soft">
          No activity history yet.
        </div>
      )}

      {!loading && entries.length > 0 && (
        <div className="space-y-3">
          {grouped.map(({ handNumber, entries: handEntries }) => (
            <section key={handNumber} className="rounded-xl border-[3px] border-ink bg-paper p-3 shadow-hard-sm">
              <h3 className="mb-2 inline-block rounded-full border-2 border-ink bg-ink px-2.5 font-display text-sm uppercase tracking-wider text-paper">
                Hand {handNumber}
              </h3>
              <ol className="space-y-1">
                {handEntries.map((entry, idx) => (
                  <li
                    key={idx}
                    data-testid={`activity-entry-${handNumber}-${idx}`}
                    className={cn('flex items-start gap-2 text-sm text-ink', entry.isUndone && 'line-through opacity-50')}
                  >
                    <span aria-hidden="true" className={cn('mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-ink', dotClass(entry))} />
                    {formatActivityEntry(entry)}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </DialogShell>
  )
}
