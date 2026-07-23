import { describe, it, expect } from 'vitest'
import { isMac, modifierSymbol, modifierName } from './platform'

describe('platform', () => {
  // jsdom's default user agent is not a Mac one, so this pins the detection direction
  // rather than restating the implementation.
  it('detects the platform from the user agent', () => {
    expect(isMac).toBe(navigator.userAgent.toUpperCase().includes('MAC'))
  })

  it('derives both modifier spellings from the same answer', () => {
    expect(modifierSymbol).toBe(isMac ? '⌘' : 'Ctrl+')
    expect(modifierName).toBe(isMac ? 'Cmd' : 'Ctrl')
  })
})
