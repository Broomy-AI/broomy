import { describe, it, expect, beforeEach } from 'vitest'
import { terminalBufferRegistry } from './terminalBufferRegistry'

describe('terminalBufferRegistry', () => {
  beforeEach(() => {
    // Clean up by unregistering any leftover sessions
    terminalBufferRegistry.unregister('session-1')
    terminalBufferRegistry.unregister('session-2')
  })

  it('returns null for unregistered sessions', () => {
    expect(terminalBufferRegistry.getBuffer('nonexistent')).toBeNull()
  })

  it('registers and retrieves a buffer', () => {
    terminalBufferRegistry.register('session-1', () => 'hello world')
    expect(terminalBufferRegistry.getBuffer('session-1')).toBe('hello world')
  })

  it('unregisters a session', () => {
    terminalBufferRegistry.register('session-1', () => 'data')
    terminalBufferRegistry.unregister('session-1')
    expect(terminalBufferRegistry.getBuffer('session-1')).toBeNull()
  })

  it('overwrites registration for same session', () => {
    terminalBufferRegistry.register('session-1', () => 'old')
    terminalBufferRegistry.register('session-1', () => 'new')
    expect(terminalBufferRegistry.getBuffer('session-1')).toBe('new')
  })

  it('handles multiple sessions independently', () => {
    terminalBufferRegistry.register('session-1', () => 'buffer-1')
    terminalBufferRegistry.register('session-2', () => 'buffer-2')
    expect(terminalBufferRegistry.getBuffer('session-1')).toBe('buffer-1')
    expect(terminalBufferRegistry.getBuffer('session-2')).toBe('buffer-2')
  })

  it('getLastLines returns last N lines', () => {
    terminalBufferRegistry.register('session-1', () => 'line1\nline2\nline3\nline4')
    expect(terminalBufferRegistry.getLastLines('session-1', 2)).toBe('line3\nline4')
  })

  it('getLastLines returns all lines when N exceeds line count', () => {
    terminalBufferRegistry.register('session-1', () => 'line1\nline2')
    expect(terminalBufferRegistry.getLastLines('session-1', 10)).toBe('line1\nline2')
  })

  it('getLastLines returns null for unregistered session', () => {
    expect(terminalBufferRegistry.getLastLines('nonexistent', 5)).toBeNull()
  })
})
