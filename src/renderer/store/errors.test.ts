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

  it('addError prepends an error', () => {
    useErrorStore.getState().addError('Something went wrong')
    const state = useErrorStore.getState()
    expect(state.errors).toHaveLength(1)
    expect(state.errors[0].message).toBe('Something went wrong')
    expect(state.errors[0].id).toMatch(/^error-/)
    expect(state.errors[0].timestamp).toBeGreaterThan(0)
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
})
