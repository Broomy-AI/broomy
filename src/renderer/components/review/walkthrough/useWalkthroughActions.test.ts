// @vitest-environment jsdom
/**
 * Tests for the useWalkthroughActions hook.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import '../../../../test/react-setup'
import { useWalkthroughActions } from './useWalkthroughActions'

vi.mock('../../../utils/focusHelpers', () => ({
  focusAgentTerminal: vi.fn(),
}))

describe('useWalkthroughActions', () => {
  beforeEach(() => {
    vi.mocked(window.fs.mkdir).mockReset()
    vi.mocked(window.fs.writeFile).mockReset()
    vi.mocked(window.pty.write).mockReset()
  })

  it('initializes with waitingForAgent false', () => {
    const { result } = renderHook(() =>
      useWalkthroughActions('/test/dir', 'pty-1')
    )
    expect(result.current.waitingForAgent).toBe(false)
  })

  it('handleGenerateWalkthrough creates directory, writes prompt, sends to agent', async () => {
    vi.mocked(window.fs.mkdir).mockResolvedValue({ success: true })
    vi.mocked(window.fs.writeFile).mockResolvedValue({ success: true })
    vi.mocked(window.pty.write).mockResolvedValue(undefined)

    const { result } = renderHook(() =>
      useWalkthroughActions('/test/dir', 'pty-1')
    )

    await act(async () => {
      await result.current.handleGenerateWalkthrough()
    })

    expect(window.fs.mkdir).toHaveBeenCalledWith('/test/dir/.broomy')
    expect(window.fs.writeFile).toHaveBeenCalledWith(
      '/test/dir/.broomy/walkthrough-prompt.md',
      expect.stringContaining('walkthrough')
    )
    expect(window.pty.write).toHaveBeenCalledWith(
      'pty-1',
      expect.stringContaining('walkthrough-prompt.md')
    )
    expect(result.current.waitingForAgent).toBe(true)
  })

  it('uses custom instructions when provided', async () => {
    vi.mocked(window.fs.mkdir).mockResolvedValue({ success: true })
    vi.mocked(window.fs.writeFile).mockResolvedValue({ success: true })
    vi.mocked(window.pty.write).mockResolvedValue(undefined)

    const { result } = renderHook(() =>
      useWalkthroughActions('/test/dir', 'pty-1', 'My custom instructions')
    )

    await act(async () => {
      await result.current.handleGenerateWalkthrough()
    })

    expect(window.fs.writeFile).toHaveBeenCalledWith(
      '/test/dir/.broomy/walkthrough-prompt.md',
      'My custom instructions'
    )
  })

  it('does nothing if agentPtyId is undefined', async () => {
    const { result } = renderHook(() =>
      useWalkthroughActions('/test/dir', undefined)
    )

    await act(async () => {
      await result.current.handleGenerateWalkthrough()
    })

    expect(window.pty.write).not.toHaveBeenCalled()
    expect(result.current.waitingForAgent).toBe(false)
  })
})
