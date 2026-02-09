import { describe, it, expect } from 'vitest'
import { categorizeError } from './errorMessages'

describe('categorizeError', () => {
  it('categorizes SSH auth failures', () => {
    const result = categorizeError('Permission denied (publickey)')
    expect(result.category).toBe('git')
    expect(result.message).toBe('SSH authentication failed')
    expect(result.suggestion).toBeTruthy()
  })

  it('categorizes host key verification failures', () => {
    const result = categorizeError('Host key verification failed')
    expect(result.category).toBe('git')
    expect(result.message).toBe('SSH authentication failed')
  })

  it('categorizes push rejected non-fast-forward', () => {
    const result = categorizeError('[rejected] main -> main (non-fast-forward)')
    expect(result.category).toBe('git')
    expect(result.message).toContain('Push rejected')
  })

  it('categorizes merge conflicts', () => {
    const result = categorizeError('CONFLICT (content): Merge conflict in file.ts')
    expect(result.category).toBe('git')
    expect(result.message).toContain('Merge conflict')
  })

  it('categorizes disk full errors', () => {
    const result = categorizeError('ENOSPC: no space left on device')
    expect(result.category).toBe('disk')
    expect(result.message).toBe('Disk is full')
  })

  it('categorizes permission denied', () => {
    const result = categorizeError('EACCES: permission denied, open /etc/secret')
    expect(result.category).toBe('permissions')
    expect(result.message).toBe('Permission denied')
  })

  it('categorizes gh not installed', () => {
    const result = categorizeError('gh: command not found')
    expect(result.category).toBe('github')
    expect(result.message).toContain('not installed')
  })

  it('categorizes gh not logged in', () => {
    const result = categorizeError('not logged into any GitHub hosts')
    expect(result.category).toBe('github')
    expect(result.message).toContain('Not logged into')
  })

  it('categorizes JSON parse errors', () => {
    const result = categorizeError('Unexpected token x in JSON at position 0')
    expect(result.category).toBe('config')
    expect(result.message).toContain('corrupted')
  })

  it('categorizes network errors', () => {
    const result = categorizeError('getaddrinfo ENOTFOUND github.com')
    expect(result.category).toBe('network')
    expect(result.message).toContain('Network')
  })

  it('categorizes git repo not found', () => {
    const result = categorizeError('does not appear to be a git repository')
    expect(result.category).toBe('git')
    expect(result.message).toContain('not found')
  })

  it('returns unknown for unrecognized errors', () => {
    const result = categorizeError('Something completely unexpected happened')
    expect(result.category).toBe('unknown')
    expect(result.message).toBe('Something completely unexpected happened')
    expect(result.suggestion).toBeUndefined()
  })

  it('truncates long unknown error messages', () => {
    const longMessage = 'x'.repeat(300)
    const result = categorizeError(longMessage)
    expect(result.message.length).toBeLessThanOrEqual(204) // 200 + '...'
    expect(result.message).toContain('...')
  })
})
