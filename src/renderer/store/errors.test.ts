import { describe, it, expect, beforeEach } from 'vitest'
import { useErrorStore } from './errors'

describe('useErrorStore', () => {
  beforeEach(() => {
    useErrorStore.setState({ errors: [], hasUnread: false })
  })

  it('has correct initial state', () => {
    const state = useErrorStore.getState()
    expect(state.errors).toEqual([])
    expect(state.hasUnread).toBe(false)
  })

  it('addError with string prepends an error', () => {
    useErrorStore.getState().addError('Something went wrong')
    const state = useErrorStore.getState()
    expect(state.errors).toHaveLength(1)
    expect(state.errors[0].message).toBe('Something went wrong')
    expect(state.errors[0].id).toMatch(/^error-/)
    expect(state.errors[0].timestamp).toBeGreaterThan(0)
    expect(state.errors[0].category).toBe('unknown')
  })

  it('addError sets hasUnread to true', () => {
    useErrorStore.getState().addError('error')
    expect(useErrorStore.getState().hasUnread).toBe(true)
  })

  it('addError prepends (newest first)', () => {
    useErrorStore.getState().addError('first')
    useErrorStore.getState().addError('second')
    const { errors } = useErrorStore.getState()
    expect(errors[0].message).toBe('second')
    expect(errors[1].message).toBe('first')
  })

  it('addError caps at 50 errors', () => {
    for (let i = 0; i < 60; i++) {
      useErrorStore.getState().addError(`error-${i}`)
    }
    expect(useErrorStore.getState().errors).toHaveLength(50)
  })

  it('addError with object preserves all fields', () => {
    useErrorStore.getState().addError({
      message: 'Git push failed',
      category: 'git',
      detail: 'rejected non-fast-forward',
      suggestion: 'Pull first',
      context: 'Explorer push button',
    })
    const error = useErrorStore.getState().errors[0]
    expect(error.message).toBe('Git push failed')
    expect(error.category).toBe('git')
    expect(error.detail).toBe('rejected non-fast-forward')
    expect(error.suggestion).toBe('Pull first')
    expect(error.context).toBe('Explorer push button')
  })

  it('addError auto-categorizes known patterns', () => {
    useErrorStore.getState().addError('Permission denied (publickey)')
    const error = useErrorStore.getState().errors[0]
    expect(error.category).toBe('git')
    expect(error.message).toBe('SSH authentication failed')
    expect(error.suggestion).toBeTruthy()
  })

  it('addError with object auto-categorizes when no category given', () => {
    useErrorStore.getState().addError({
      message: 'ENOSPC: no space left on device',
    })
    const error = useErrorStore.getState().errors[0]
    expect(error.category).toBe('disk')
    expect(error.suggestion).toBeTruthy()
  })

  it('addError with object uses explicit category over auto-categorize', () => {
    useErrorStore.getState().addError({
      message: 'Permission denied (publickey)',
      category: 'config',
    })
    const error = useErrorStore.getState().errors[0]
    expect(error.category).toBe('config')
  })

  it('dismissError removes a specific error', () => {
    useErrorStore.getState().addError('to remove')
    useErrorStore.getState().addError('to keep')
    const { errors } = useErrorStore.getState()
    const idToRemove = errors.find(e => e.message === 'to remove')!.id
    useErrorStore.getState().dismissError(idToRemove)
    const updated = useErrorStore.getState().errors
    expect(updated).toHaveLength(1)
    expect(updated[0].message).toBe('to keep')
  })

  it('clearAll removes all errors and resets hasUnread', () => {
    useErrorStore.getState().addError('err1')
    useErrorStore.getState().addError('err2')
    useErrorStore.getState().clearAll()
    const state = useErrorStore.getState()
    expect(state.errors).toEqual([])
    expect(state.hasUnread).toBe(false)
  })

  it('markRead sets hasUnread to false', () => {
    useErrorStore.getState().addError('err')
    expect(useErrorStore.getState().hasUnread).toBe(true)
    useErrorStore.getState().markRead()
    expect(useErrorStore.getState().hasUnread).toBe(false)
  })

  it('generateReportUrl returns a URL for existing error', () => {
    useErrorStore.getState().addError('Test error')
    const error = useErrorStore.getState().errors[0]
    const url = useErrorStore.getState().generateReportUrl(error.id)
    expect(url).toBeTruthy()
    expect(url).toContain('github.com/Broomy-AI/broomy/issues/new')
    expect(url).toContain('bug_report.yml')
  })

  it('generateReportUrl returns null for non-existent error', () => {
    const url = useErrorStore.getState().generateReportUrl('non-existent')
    expect(url).toBeNull()
  })
})
