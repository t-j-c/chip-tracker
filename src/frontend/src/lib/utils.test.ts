import { describe, it, expect } from 'vitest'
import { cn } from './utils'

describe('utils', () => {
  describe('cn', () => {
    it('combines class names with clsx and tailwind-merge', () => {
      const result = cn('px-2', 'py-1')
      expect(result).toBe('px-2 py-1')
    })

    it('merges tailwind classes correctly', () => {
      const result = cn('px-2', 'px-4')
      expect(result).toBe('px-4')
    })

    it('handles empty inputs', () => {
      const result = cn()
      expect(result).toBe('')
    })
  })
})
