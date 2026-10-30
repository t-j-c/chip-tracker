import { describe, it, expect } from 'vitest'
import { formatActivityEntry } from './activityFormat'

describe('activityFormat', () => {
  describe('formatActivityEntry', () => {
    it('formats PlayerAction bet', () => {
      const result = formatActivityEntry({
        sequence: 1,
        entryType: 'PlayerAction',
        playerId: 'player1',
        action: 'Bet',
        amount: 100,
        phase: 'Flop',
        stateVersion: 1,
        isUndone: false,
        playerName: 'Alice',
        handNumber: 1,
      })
      expect(result).toBe('Alice bet $100 on the Flop')
    })

    it('formats PlayerAction raise', () => {
      const result = formatActivityEntry({
        sequence: 2,
        entryType: 'PlayerAction',
        playerId: 'player1',
        action: 'Raise',
        amount: 300,
        phase: 'PreFlop',
        stateVersion: 1,
        isUndone: false,
        playerName: 'Alice',
        handNumber: 1,
      })
      expect(result).toBe('Alice raised to $300 preflop')
    })

    it('formats PlayerAction fold', () => {
      const result = formatActivityEntry({
        sequence: 3,
        entryType: 'PlayerAction',
        playerId: 'player2',
        action: 'Fold',
        amount: 0,
        phase: 'Turn',
        stateVersion: 1,
        isUndone: false,
        playerName: 'Bob',
        handNumber: 1,
      })
      expect(result).toBe('Bob folded on the Turn')
    })

    it('formats PlayerAction check', () => {
      const result = formatActivityEntry({
        sequence: 4,
        entryType: 'PlayerAction',
        playerId: 'player3',
        action: 'Check',
        amount: 0,
        phase: 'River',
        stateVersion: 1,
        isUndone: false,
        playerName: 'Carol',
        handNumber: 1,
      })
      expect(result).toBe('Carol checked on the River')
    })

    it('formats PlayerAction call with amount', () => {
      const result = formatActivityEntry({
        sequence: 5,
        entryType: 'PlayerAction',
        playerId: 'player4',
        action: 'Call',
        amount: 50,
        phase: 'Flop',
        stateVersion: 1,
        isUndone: false,
        playerName: 'Dave',
        handNumber: 1,
      })
      expect(result).toBe('Dave called $50 on the Flop')
    })

    it('formats PlayerAction all-in', () => {
      const result = formatActivityEntry({
        sequence: 6,
        entryType: 'PlayerAction',
        playerId: 'player1',
        action: 'AllIn',
        amount: 820,
        phase: 'Turn',
        stateVersion: 1,
        isUndone: false,
        playerName: 'Alice',
        handNumber: 1,
      })
      expect(result).toBe('Alice went all-in for $820 on the Turn')
    })

    it('formats PotWon simple', () => {
      const result = formatActivityEntry({
        sequence: 7,
        entryType: 'PotWon',
        playerId: 'player2',
        amount: 550,
        stateVersion: 1,
        isUndone: false,
        playerName: 'Bob',
        handNumber: 1,
      })
      expect(result).toBe('Bob won $550')
    })

    it('formats PotWon with side pot', () => {
      const result = formatActivityEntry({
        sequence: 8,
        entryType: 'PotWon',
        playerId: 'player2',
        amount: 550,
        potIndex: 2,
        stateVersion: 1,
        isUndone: false,
        playerName: 'Bob',
        handNumber: 1,
      })
      expect(result).toBe('Bob won $550 (side pot 2)')
    })

    it('formats BlindPosted', () => {
      const result = formatActivityEntry({
        sequence: 9,
        entryType: 'BlindPosted',
        playerId: 'player3',
        amount: 10,
        blindType: 'SmallBlind',
        stateVersion: 1,
        isUndone: false,
        playerName: 'Carol',
        handNumber: 1,
      })
      expect(result).toBe('Carol posted small blind $10')
    })

    it('formats BlindPosted big blind', () => {
      const result = formatActivityEntry({
        sequence: 10,
        entryType: 'BlindPosted',
        playerId: 'player4',
        amount: 20,
        blindType: 'BigBlind',
        stateVersion: 1,
        isUndone: false,
        playerName: 'Dave',
        handNumber: 1,
      })
      expect(result).toBe('Dave posted big blind $20')
    })

    it('formats Rebuy', () => {
      const result = formatActivityEntry({
        sequence: 11,
        entryType: 'Rebuy',
        playerId: 'player3',
        amount: 1000,
        stateVersion: 1,
        isUndone: false,
        playerName: 'Carol',
        handNumber: 1,
      })
      expect(result).toBe('Carol re-bought for $1,000')
    })

    it('formats CashOut', () => {
      const result = formatActivityEntry({
        sequence: 12,
        entryType: 'CashOut',
        playerId: 'player1',
        amount: 0,
        stateVersion: 1,
        isUndone: false,
        playerName: 'Alice',
        handNumber: 1,
      })
      expect(result).toBe('Alice cashed out')
    })

    it('formats HandStarted', () => {
      const result = formatActivityEntry({
        sequence: 13,
        entryType: 'HandStarted',
        amount: 0,
        stateVersion: 1,
        isUndone: false,
        handNumber: 3,
      })
      expect(result).toBe('Hand 3 started')
    })

    it('formats PhaseAdvanced', () => {
      const result = formatActivityEntry({
        sequence: 14,
        entryType: 'PhaseAdvanced',
        amount: 0,
        phase: 'Flop',
        stateVersion: 1,
        isUndone: false,
        handNumber: 1,
      })
      expect(result).toBe('Advanced to the Flop')
    })

    it('formats Refund', () => {
      const result = formatActivityEntry({
        sequence: 15,
        entryType: 'Refund',
        playerId: 'player2',
        amount: 75,
        stateVersion: 1,
        isUndone: false,
        playerName: 'Bob',
        handNumber: 1,
      })
      expect(result).toBe('Bob was refunded $75 (uncalled bet)')
    })

    it('formats large amounts with locale string', () => {
      const result = formatActivityEntry({
        sequence: 16,
        entryType: 'Rebuy',
        playerId: 'player1',
        amount: 12500,
        stateVersion: 1,
        isUndone: false,
        playerName: 'Alice',
        handNumber: 1,
      })
      expect(result).toContain('12,500')
    })
  })
})
