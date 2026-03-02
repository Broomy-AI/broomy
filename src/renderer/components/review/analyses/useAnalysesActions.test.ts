// @vitest-environment jsdom
/**
 * Tests for the useAnalysesActions hook.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import '../../../../test/react-setup'
import { useAnalysesActions } from './useAnalysesActions'

vi.mock('../../../utils/focusHelpers', () => ({
  focusAgentTerminal: vi.fn(),
}))

describe('useAnalysesActions', () => {
  beforeEach(() => {
    vi.mocked(window.fs.mkdir).mockReset()
    vi.mocked(window.fs.writeFile).mockReset()
    vi.mocked(window.pty.write).mockReset()
  })

  it('initializes with empty waitingFor set', () => {
    const { result } = renderHook(() =>
      useAnalysesActions('/test/dir', 'pty-1', ['security'])
    )
    expect(result.current.waitingFor.size).toBe(0)
  })

  it('handleRunAnalysis writes prompt and sends to agent', async () => {
    vi.mocked(window.fs.mkdir).mockResolvedValue({ success: true })
    vi.mocked(window.fs.writeFile).mockResolvedValue({ success: true })
    vi.mocked(window.pty.write).mockResolvedValue(undefined)

    const { result } = renderHook(() =>
      useAnalysesActions('/test/dir', 'pty-1', ['security'])
    )

    await act(async () => {
      await result.current.handleRunAnalysis('security')
    })

    expect(window.fs.mkdir).toHaveBeenCalledWith('/test/dir/.broomy/analyses')
    expect(window.fs.writeFile).toHaveBeenCalledWith(
      '/test/dir/.broomy/analyses/security-prompt.md',
      expect.stringContaining('security')
    )
    expect(window.pty.write).toHaveBeenCalledWith(
      'pty-1',
      expect.stringContaining('security-prompt.md')
    )
    expect(result.current.waitingFor.has('security')).toBe(true)
  })

  it('does nothing if agentPtyId is undefined', async () => {
    const { result } = renderHook(() =>
      useAnalysesActions('/test/dir', undefined, ['security'])
    )

    await act(async () => {
      await result.current.handleRunAnalysis('security')
    })

    expect(window.pty.write).not.toHaveBeenCalled()
  })

  it('does nothing for unknown analysis id', async () => {
    const { result } = renderHook(() =>
      useAnalysesActions('/test/dir', 'pty-1', ['unknown'])
    )

    await act(async () => {
      await result.current.handleRunAnalysis('unknown')
    })

    expect(window.pty.write).not.toHaveBeenCalled()
  })
})
