import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActivityStrip } from './ActivityStrip'
import type { ActivityEntry } from '@/types/game'

describe('ActivityStrip', () => {
  it('renders activity-strip testid when entries exist', () => {
    const entries: ActivityEntry[] = [
      { sequence: 1, entryType: 'PlayerAction', playerName: 'Alice', action: 'Bet', amount: 100, phase: 'Flop', stateVersion: 1, isUndone: false, handNumber: 1 },
    ]
    const { getByTestId } = render(
      <ActivityStrip entries={entries} onOpenHistory={vi.fn()} />
    )
    expect(getByTestId('activity-strip')).toBeInTheDocument()
  })

  it('shows empty state when no entries', () => {
    const { container } = render(<ActivityStrip entries={[]} onOpenHistory={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('displays most recent non-undone entry', () => {
    const entries: ActivityEntry[] = [
      { sequence: 1, entryType: 'HandStarted', amount: 0, stateVersion: 1, isUndone: false, handNumber: 1 },
      { sequence: 2, entryType: 'BlindPosted', playerName: 'Alice', amount: 10, blindType: 'SmallBlind', stateVersion: 1, isUndone: false, playerId: 'p1', handNumber: 1 },
      { sequence: 3, entryType: 'PlayerAction', playerName: 'Bob', action: 'Bet', amount: 50, phase: 'PreFlop', stateVersion: 1, isUndone: false, playerId: 'p2', handNumber: 1 },
    ]
    render(<ActivityStrip entries={entries} onOpenHistory={vi.fn()} />)
    expect(screen.getByTestId('activity-strip-text')).toHaveTextContent('Bob bet $50 on preflop')
  })

  it('skips undone entries when showing most recent', () => {
    const entries: ActivityEntry[] = [
      { sequence: 1, entryType: 'PlayerAction', playerName: 'Alice', action: 'Bet', amount: 100, phase: 'Flop', stateVersion: 1, isUndone: false, playerId: 'p1', handNumber: 1 },
      { sequence: 2, entryType: 'PlayerAction', playerName: 'Bob', action: 'Bet', amount: 50, phase: 'Flop', stateVersion: 1, isUndone: true, playerId: 'p2', handNumber: 1 },
    ]
    render(<ActivityStrip entries={entries} onOpenHistory={vi.fn()} />)
    expect(screen.getByTestId('activity-strip-text')).toHaveTextContent('Alice bet $100 on the Flop')
  })

  it('calls onOpenHistory when clicked', async () => {
    const user = userEvent.setup()
    const handleOpen = vi.fn()
    const entries: ActivityEntry[] = [
      { sequence: 1, entryType: 'PlayerAction', playerName: 'Alice', action: 'Bet', amount: 100, phase: 'Flop', stateVersion: 1, isUndone: false, playerId: 'p1', handNumber: 1 },
    ]
    render(<ActivityStrip entries={entries} onOpenHistory={handleOpen} />)
    
    const button = screen.getByTestId('activity-strip')
    await user.click(button)
    expect(handleOpen).toHaveBeenCalled()
  })

  it('has aria-label for accessibility', () => {
    const entries: ActivityEntry[] = [
      { sequence: 1, entryType: 'PlayerAction', playerName: 'Alice', action: 'Bet', amount: 100, phase: 'Flop', stateVersion: 1, isUndone: false, playerId: 'p1', handNumber: 1 },
    ]
    render(<ActivityStrip entries={entries} onOpenHistory={vi.fn()} />)
    const button = screen.getByTestId('activity-strip')
    expect(button).toHaveAttribute('aria-label', 'Activity history')
  })

  it('only displays when there are non-undone entries', () => {
    const entries: ActivityEntry[] = [
      { sequence: 1, entryType: 'PlayerAction', playerName: 'Alice', action: 'Bet', amount: 100, phase: 'Flop', stateVersion: 1, isUndone: true, playerId: 'p1', handNumber: 1 },
    ]
    const { queryByTestId } = render(<ActivityStrip entries={entries} onOpenHistory={vi.fn()} />)
    expect(queryByTestId('activity-strip-text')).not.toBeInTheDocument()
  })
})
