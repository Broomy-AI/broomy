import { describe, it, expect, beforeEach } from 'vitest'
import { reportMainSyncFailure } from './mainSyncError'
import { useErrorStore } from '../../store/errors'

beforeEach(() => { useErrorStore.setState({ detailError: null }) })

describe('reportMainSyncFailure', () => {
  it('surfaces the given error as an app-scoped error detail', () => {
    reportMainSyncFailure('main/ has diverged from origin')

    const err = useErrorStore.getState().detailError
    expect(err?.displayMessage).toBe('Could not sync the main clone')
    expect(err?.scope).toBe('app')
    expect(err?.message).toContain('diverged')
    expect(err?.detail).toContain('diverged')
  })

  it('falls back to a generic message when no error string is given', () => {
    reportMainSyncFailure()

    const err = useErrorStore.getState().detailError
    expect(err?.message).toBe('Failed to sync main')
    expect(err?.detail).toContain('fast-forward could not be completed')
  })
})
