import type { ActivityEntry, GamePhase } from '@/types/game'

const PHASE_LABELS: Record<string, string> = {
  PreFlop: 'preflop',
  Flop: 'the Flop',
  Turn: 'the Turn',
  River: 'the River',
  Showdown: 'Showdown',
}

function formatCurrency(amount: number): string {
  return '$' + amount.toLocaleString()
}

function getPhaseLabel(phase: string | GamePhase | undefined): string {
  if (!phase) return ''
  return PHASE_LABELS[phase as string] || phase
}

export function formatActivityEntry(entry: ActivityEntry): string {
  switch (entry.entryType) {
    case 'PlayerAction': {
      const player = entry.playerName || 'Unknown'
      const phase = getPhaseLabel(entry.phase)

      switch (entry.action) {
        case 'Bet':
          return `${player} bet ${formatCurrency(entry.amount)} on ${phase}`
        case 'Raise':
          return `${player} raised to ${formatCurrency(entry.amount)} ${phase}`
        case 'AllIn':
          return `${player} went all-in for ${formatCurrency(entry.amount)} on ${phase}`
        case 'Call':
          return `${player} called ${formatCurrency(entry.amount)} on ${phase}`
        case 'Fold':
          return `${player} folded on ${phase}`
        case 'Check':
          return `${player} checked on ${phase}`
        default:
          return `${player} took action on ${phase}`
      }
    }

    case 'PotWon': {
      const player = entry.playerName || 'Unknown'
      const amount = formatCurrency(entry.amount || 0)
      if (entry.potIndex !== undefined && entry.potIndex > 0) {
        return `${player} won ${amount} (side pot ${entry.potIndex})`
      }
      return `${player} won ${amount}`
    }

    case 'BlindPosted': {
      const player = entry.playerName || 'Unknown'
      const amount = formatCurrency(entry.amount || 0)
      const blindLabel = entry.blindType === 'SmallBlind' ? 'small blind' : 'big blind'
      return `${player} posted ${blindLabel} ${amount}`
    }

    case 'Rebuy': {
      const player = entry.playerName || 'Unknown'
      const amount = formatCurrency(entry.amount || 0)
      return `${player} re-bought for ${amount}`
    }

    case 'CashOut': {
      const player = entry.playerName || 'Unknown'
      return `${player} cashed out`
    }

    case 'HandStarted': {
      return `Hand ${entry.handNumber} started`
    }

    case 'PhaseAdvanced': {
      const phase = getPhaseLabel(entry.phase)
      return `Advanced to ${phase}`
    }

    case 'Refund': {
      const player = entry.playerName || 'Unknown'
      const amount = formatCurrency(entry.amount || 0)
      return `${player} was refunded ${amount} (uncalled bet)`
    }

    default:
      return 'Unknown activity'
  }
}
