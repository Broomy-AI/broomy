/**
 * Tests for checks type definitions and constants.
 */
import { describe, it, expect } from 'vitest'
import { BUILTIN_CHECKS } from './checks'

describe('BUILTIN_CHECKS', () => {
  it('has three built-in checks', () => {
    expect(BUILTIN_CHECKS).toHaveLength(3)
  })

  it('includes lint, typecheck, and test', () => {
    const ids = BUILTIN_CHECKS.map(c => c.id)
    expect(ids).toEqual(['lint', 'typecheck', 'test'])
  })

  it('all checks are enabled by default', () => {
    expect(BUILTIN_CHECKS.every(c => c.enabled)).toBe(true)
  })

  it('all checks have non-empty commands', () => {
    expect(BUILTIN_CHECKS.every(c => c.command.length > 0)).toBe(true)
  })
})
