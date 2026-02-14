// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAppBannerError, usePanelBannerError, useDialogBannerError } from './useErrorBanners'
import { useErrorStore } from '../store/errors'

describe('useErrorBanners', () => {
  beforeEach(() => {
    useErrorStore.setState({ errors: [], hasUnread: false, detailError: null })
  })

  // --- useAppBannerError ---
  describe('useAppBannerError', () => {
    it('returns null when there are no errors', () => {
      const { result } = renderHook(() => useAppBannerError())
      expect(result.current).toBeNull()
    })

    it('returns the first undismissed app-scope error', () => {
      useErrorStore.getState().addError('first app error')
      useErrorStore.getState().addError('second app error')
      const { result } = renderHook(() => useAppBannerError())
      // addError prepends, so newest is first — find() returns the first match
      expect(result.current).not.toBeNull()
      expect(result.current!.message).toBe('second app error')
    })

    it('returns null when all app-scope errors are dismissed', () => {
      useErrorStore.getState().addError('dismissed error')
      const id = useErrorStore.getState().errors[0].id
      useErrorStore.getState().dismissError(id)
      const { result } = renderHook(() => useAppBannerError())
      expect(result.current).toBeNull()
    })

    it('skips panel-scope errors', () => {
      useErrorStore.getState().addScopedError({
        message: 'panel error',
        scope: { panel: 'explorer' },
      })
      const { result } = renderHook(() => useAppBannerError())
      expect(result.current).toBeNull()
    })

    it('skips dialog-scope errors', () => {
      useErrorStore.getState().addScopedError({
        message: 'dialog error',
        scope: { dialog: 'newSession' },
      })
      const { result } = renderHook(() => useAppBannerError())
      expect(result.current).toBeNull()
    })
  })

  // --- usePanelBannerError ---
  describe('usePanelBannerError', () => {
    it('returns null when there are no errors', () => {
      const { result } = renderHook(() => usePanelBannerError('explorer'))
      expect(result.current).toBeNull()
    })

    it('returns the first undismissed error for the matching panel', () => {
      useErrorStore.getState().addScopedError({
        message: 'explorer error',
        scope: { panel: 'explorer' },
      })
      const { result } = renderHook(() => usePanelBannerError('explorer'))
      expect(result.current).not.toBeNull()
      expect(result.current!.message).toBe('explorer error')
    })

    it('returns null for a different panel id', () => {
      useErrorStore.getState().addScopedError({
        message: 'explorer error',
        scope: { panel: 'explorer' },
      })
      const { result } = renderHook(() => usePanelBannerError('fileViewer'))
      expect(result.current).toBeNull()
    })

    it('returns null when the panel error is dismissed', () => {
      useErrorStore.getState().addScopedError({
        message: 'explorer error',
        scope: { panel: 'explorer' },
      })
      const id = useErrorStore.getState().errors[0].id
      useErrorStore.getState().dismissError(id)
      const { result } = renderHook(() => usePanelBannerError('explorer'))
      expect(result.current).toBeNull()
    })

    it('ignores app-scope errors', () => {
      useErrorStore.getState().addError('app error')
      const { result } = renderHook(() => usePanelBannerError('explorer'))
      expect(result.current).toBeNull()
    })
  })

  // --- useDialogBannerError ---
  describe('useDialogBannerError', () => {
    it('returns null when there are no errors', () => {
      const { result } = renderHook(() => useDialogBannerError('newSession'))
      expect(result.current).toBeNull()
    })

    it('returns the first undismissed error for the matching dialog', () => {
      useErrorStore.getState().addScopedError({
        message: 'dialog error',
        scope: { dialog: 'newSession' },
      })
      const { result } = renderHook(() => useDialogBannerError('newSession'))
      expect(result.current).not.toBeNull()
      expect(result.current!.message).toBe('dialog error')
    })

    it('returns null for a different dialog id', () => {
      useErrorStore.getState().addScopedError({
        message: 'dialog error',
        scope: { dialog: 'newSession' },
      })
      const { result } = renderHook(() => useDialogBannerError('otherDialog'))
      expect(result.current).toBeNull()
    })

    it('returns null when the dialog error is dismissed', () => {
      useErrorStore.getState().addScopedError({
        message: 'dialog error',
        scope: { dialog: 'newSession' },
      })
      const id = useErrorStore.getState().errors[0].id
      useErrorStore.getState().dismissError(id)
      const { result } = renderHook(() => useDialogBannerError('newSession'))
      expect(result.current).toBeNull()
    })

    it('ignores panel-scope errors', () => {
      useErrorStore.getState().addScopedError({
        message: 'panel error',
        scope: { panel: 'explorer' },
      })
      const { result } = renderHook(() => useDialogBannerError('explorer'))
      expect(result.current).toBeNull()
    })
  })
})
