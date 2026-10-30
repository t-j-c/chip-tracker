import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActivityHistoryModal } from './ActivityHistoryModal'

describe('ActivityHistoryModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset fetch mock before each test
    global.fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ entries: [] })))
    )
  })

  it('renders dialog with title when open', async () => {
    render(
      <ActivityHistoryModal
        open={true}
        onOpenChange={vi.fn()}
        roomCode="TEST1"
        fallbackEntries={[]}
      />
    )
    await waitFor(() => {
      expect(screen.getByText('Activity History')).toBeInTheDocument()
    })
  })

  it('does not show dialog content when open is false', () => {
    const { queryByText } = render(
      <ActivityHistoryModal
        open={false}
        onOpenChange={vi.fn()}
        roomCode="TEST1"
        fallbackEntries={[]}
      />
    )
    // When closed, Radix Dialog doesn't render the content
    expect(queryByText('Activity History')).not.toBeInTheDocument()
  })

  it('fetches activity from endpoint when open', async () => {
    const mockFetch = vi.mocked(global.fetch)
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          entries: [
            {
              sequence: 1,
              entryType: 'PlayerAction',
              playerName: 'Alice',
              action: 'Bet',
              amount: 100,
              phase: 'Flop',
              stateVersion: 1,
              isUndone: false,
              playerId: 'p1',
              handNumber: 1,
            },
          ],
        })
      )
    )

    render(
      <ActivityHistoryModal
        open={true}
        onOpenChange={vi.fn()}
        roomCode="TEST1"
        fallbackEntries={[]}
      />
    )

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/rooms/TEST1/activity')
    })
  })

  it('uses fallback entries on fetch error', async () => {
    const mockFetch = vi.mocked(global.fetch)
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const fallbackEntries = [
      {
        sequence: 1,
        entryType: 'PlayerAction' as const,
        playerName: 'Bob',
        action: 'Fold' as const,
        amount: 0,
        phase: 'Turn' as const,
        stateVersion: 1,
        isUndone: false,
        playerId: 'p2',
        handNumber: 1,
      },
    ]

    render(
      <ActivityHistoryModal
        open={true}
        onOpenChange={vi.fn()}
        roomCode="TEST1"
        fallbackEntries={fallbackEntries}
      />
    )

    await waitFor(() => {
      expect(screen.getByText(/Bob folded/i)).toBeInTheDocument()
    })
  })

  it('groups entries by handNumber descending', async () => {
    const mockFetch = vi.mocked(global.fetch)
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          entries: [
            { sequence: 1, entryType: 'HandStarted', amount: 0, stateVersion: 1, isUndone: false, handNumber: 2 },
            { sequence: 2, entryType: 'PlayerAction', playerName: 'Alice', action: 'Bet', amount: 50, phase: 'Flop', stateVersion: 1, isUndone: false, playerId: 'p1', handNumber: 2 },
            { sequence: 3, entryType: 'HandStarted', amount: 0, stateVersion: 1, isUndone: false, handNumber: 1 },
            { sequence: 4, entryType: 'PlayerAction', playerName: 'Bob', action: 'Call', amount: 50, phase: 'Flop', stateVersion: 1, isUndone: false, playerId: 'p2', handNumber: 1 },
          ],
        })
      )
    )

    render(
      <ActivityHistoryModal
        open={true}
        onOpenChange={vi.fn()}
        roomCode="TEST1"
        fallbackEntries={[]}
      />
    )

    await waitFor(() => {
      const groups = screen.getAllByRole('heading', { level: 3 })
      expect(groups[0]).toHaveTextContent('Hand 2')
      expect(groups[1]).toHaveTextContent('Hand 1')
    })
  })

  it('shows undone entries with strike-through and reduced opacity', async () => {
    const mockFetch = vi.mocked(global.fetch)
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          entries: [
            { sequence: 1, entryType: 'HandStarted', amount: 0, stateVersion: 1, isUndone: false, handNumber: 1 },
            { sequence: 2, entryType: 'PlayerAction', playerName: 'Alice', action: 'Bet', amount: 100, phase: 'Flop', stateVersion: 1, isUndone: true, playerId: 'p1', handNumber: 1 },
          ],
        })
      )
    )

    render(
      <ActivityHistoryModal
        open={true}
        onOpenChange={vi.fn()}
        roomCode="TEST1"
        fallbackEntries={[]}
      />
    )

    await waitFor(() => {
      const undoneEntry = screen.getByText(/Alice bet/)
      expect(undoneEntry).toHaveClass('line-through', 'opacity-50')
    })
  })

  it('calls onOpenChange when close button clicked', async () => {
    const user = userEvent.setup()
    const handleOpenChange = vi.fn()
    const mockFetch = vi.mocked(global.fetch)
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ entries: [] }))
    )

    render(
      <ActivityHistoryModal
        open={true}
        onOpenChange={handleOpenChange}
        roomCode="TEST1"
        fallbackEntries={[]}
      />
    )

    const closeButton = screen.getByRole('button', { name: /close/i })
    await user.click(closeButton)
    expect(handleOpenChange).toHaveBeenCalledWith(false)
  })

  it('displays entries newest-first within each hand', async () => {
    const mockFetch = vi.mocked(global.fetch)
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          entries: [
            { sequence: 1, entryType: 'HandStarted', amount: 0, stateVersion: 1, isUndone: false, handNumber: 1 },
            { sequence: 2, entryType: 'BlindPosted', playerName: 'Bob', amount: 20, blindType: 'BigBlind', stateVersion: 1, isUndone: false, playerId: 'p2', handNumber: 1 },
            { sequence: 3, entryType: 'PlayerAction', playerName: 'Alice', action: 'Raise', amount: 50, phase: 'PreFlop', stateVersion: 1, isUndone: false, playerId: 'p1', handNumber: 1 },
          ],
        })
      )
    )

    render(
      <ActivityHistoryModal
        open={true}
        onOpenChange={vi.fn()}
        roomCode="TEST1"
        fallbackEntries={[]}
      />
    )

    await waitFor(() => {
      const entries = screen.getAllByText(/Alice|Bob/)
      // Should show Alice (raise) before Bob (blind) since Alice is newer
      expect(entries[0]).toHaveTextContent('Alice')
      expect(entries[1]).toHaveTextContent('Bob')
    })
  })
})
