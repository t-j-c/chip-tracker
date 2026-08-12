import { useEffect, useState, useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { formatActivityEntry } from '@/lib/activityFormat'
import type { ActivityEntry } from '@/types/game'

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
        // Use fallback entries on error
        setEntries(fallbackEntriesRef.current)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [open, roomCode])

  // Group entries by handNumber, descending, and reverse within each group
  const grouped: GroupedEntries[] = []
  const handMap = new Map<number, ActivityEntry[]>()

  for (const entry of entries) {
    const handNum = entry.handNumber ?? 0
    if (!handMap.has(handNum)) {
      handMap.set(handNum, [])
    }
    handMap.get(handNum)!.push(entry)
  }

  // Sort hands descending and reverse entries within each hand (newest first)
  Array.from(handMap.entries())
    .sort(([a], [b]) => b - a)
    .forEach(([handNumber, handEntries]) => {
      grouped.push({
        handNumber,
        entries: handEntries.reverse(),
      })
    })

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 max-h-[80vh] w-[90vw] max-w-lg translate-x-[-50%] translate-y-[-50%] overflow-y-auto rounded-lg border border-surface-card bg-surface-elevated p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-xl font-semibold text-text-primary">
              Activity History
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                aria-label="Close activity history"
                className="rounded-md hover:bg-surface-card p-1 text-text-secondary hover:text-text-primary"
              >
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          {loading && (
            <div className="text-center text-text-secondary py-4">
              Loading activity history...
            </div>
          )}

          {!loading && entries.length === 0 && (
            <div className="text-center text-text-secondary py-4">
              No activity history yet.
            </div>
          )}

          {!loading && entries.length > 0 && (
            <div className="space-y-6">
              {grouped.map(({ handNumber, entries: handEntries }) => (
                <div key={handNumber}>
                  <h3 className="text-sm font-semibold text-accent-info mb-2">
                    Hand {handNumber}
                  </h3>
                  <div className="space-y-1">
                    {handEntries.map((entry, idx) => (
                      <div
                        key={idx}
                        className={`text-sm text-text-secondary ${
                          entry.isUndone ? 'line-through opacity-50' : ''
                        }`}
                      >
                        {formatActivityEntry(entry)}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
