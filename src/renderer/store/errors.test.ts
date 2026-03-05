import { describe, it, expect, beforeEach } from 'vitest'
import { useErrorStore, type AppError } from './errors'

describe('useErrorStore', () => {
  beforeEach(() => {
    useErrorStore.setState({ detailError: null })
  })

  it('has correct initial state', () => {
    const state = useErrorStore.getState()
    expect(state.detailError).toBeNull()
  })

  it('showErrorDetail sets detailError', () => {
    const error: AppError = {
      id: 'err-1',
      message: 'raw error',
      displayMessage: 'Friendly message',
      scope: 'app',
      dismissed: false,
      timestamp: Date.now(),
    }
    useErrorStore.getState().showErrorDetail(error)
    expect(useErrorStore.getState().detailError).toBe(error)
  })

  it('hideErrorDetail clears detailError', () => {
    const error: AppError = {
      id: 'err-1',
      message: 'raw error',
      displayMessage: 'Friendly message',
      scope: 'app',
      dismissed: false,
      timestamp: Date.now(),
    }
    useErrorStore.getState().showErrorDetail(error)
    useErrorStore.getState().hideErrorDetail()
    expect(useErrorStore.getState().detailError).toBeNull()
  })
})
