import { describe, it, expect } from 'vitest'
import { isSessionNotFoundError } from './agentSdkHelpers'

describe('isSessionNotFoundError', () => {
  it('matches "No conversation found with session: <id>"', () => {
    expect(isSessionNotFoundError('No conversation found with session: abc-123')).toBe(true)
  })

  it('matches "Session not found"', () => {
    expect(isSessionNotFoundError('Session not found')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isSessionNotFoundError('NO CONVERSATION FOUND with session: xyz')).toBe(true)
    expect(isSessionNotFoundError('SESSION NOT FOUND')).toBe(true)
  })

  it('matches when embedded in a longer message', () => {
    expect(isSessionNotFoundError('Error: no conversation found for the given ID')).toBe(true)
    expect(isSessionNotFoundError('API error: session not found (expired)')).toBe(true)
  })

  it('does not match unrelated errors', () => {
    expect(isSessionNotFoundError('Rate limit exceeded')).toBe(false)
    expect(isSessionNotFoundError('Network timeout')).toBe(false)
    expect(isSessionNotFoundError('Authentication failed')).toBe(false)
    expect(isSessionNotFoundError('Internal server error')).toBe(false)
  })

  it('does not match partial keywords', () => {
    expect(isSessionNotFoundError('conversation was reset')).toBe(false)
    expect(isSessionNotFoundError('session expired')).toBe(false)
    expect(isSessionNotFoundError('not found')).toBe(false)
  })
})
