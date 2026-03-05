// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import '../../../test/react-setup'

vi.mock('../../utils/focusHelpers', () => ({
  sendAgentPrompt: vi.fn().mockResolvedValue(undefined),
  focusAgentTerminal: vi.fn(),
}))

import { useReviewActions } from './useReviewActions'
import type { Session } from '../../store/sessions'
import type { ReviewDataState } from './useReviewData'

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    name: 'test',
    directory: '/test/repo',
    branch: 'feature/review',
    status: 'idle',
    agentId: 'agent-1',
    agentPtyId: 'pty-1',
    panelVisibility: {},
    showExplorer: true,
    showFileViewer: false,
    showDiff: false,
    selectedFilePath: null,
    planFilePath: null,
    fileViewerPosition: 'top',
    layoutSizes: {
      explorerWidth: 256,
      fileViewerSize: 300,
      userTerminalHeight: 192,
      diffPanelWidth: 320,
      tutorialPanelWidth: 320,
    },
    explorerFilter: 'files',
    lastMessage: null,
    lastMessageTime: null,
    isUnread: false,
    workingStartTime: null,
    recentFiles: [],
    terminalTabs: { tabs: [{ id: 'tab-1', name: 'Terminal' }], activeTabId: 'tab-1' },
    branchStatus: 'in-progress',
    isArchived: false,
    isRestored: false,
    prNumber: 42,
    prUrl: 'https://github.com/pr/42',
    prBaseBranch: 'main',
    ...overrides,
  }
}

function makeState(overrides: Partial<ReviewDataState> = {}): ReviewDataState {
  return {
    reviewMarkdown: null,
    fetching: false,
    waitingForAgent: false,
    fetchingStatus: null,
    error: null,
    showGitignoreModal: false,
    pendingGenerate: false,
    mergeBase: 'abc123',
    broomyDir: '/test/repo/.broomy',
    outputDir: '/test/repo/.broomy/output',
    reviewFilePath: '/test/repo/.broomy/output/review.md',
    promptFilePath: '/test/repo/.broomy/output/review-prompt.md',
    setReviewMarkdown: vi.fn(),
    setFetching: vi.fn(),
    setWaitingForAgent: vi.fn(),
    setFetchingStatus: vi.fn(),
    setError: vi.fn(),
    setShowGitignoreModal: vi.fn(),
    setPendingGenerate: vi.fn(),
    setMergeBase: vi.fn(),
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useReviewActions', () => {
  it('handleOpenPrUrl opens the PR URL', () => {
    const session = makeSession()
    const onSelectFile = vi.fn()
    const state = makeState()

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, onSelectFile, state)
    )

    act(() => {
      result.current.handleOpenPrUrl()
    })

    expect(onSelectFile).toHaveBeenCalledWith('https://github.com/pr/42', false)
  })

  it('handleGitignoreCancel closes modal and resets pending', () => {
    const state = makeState()
    const { result } = renderHook(() =>
      useReviewActions(makeSession(), undefined, vi.fn(), state)
    )

    act(() => {
      result.current.handleGitignoreCancel()
    })

    expect(state.setShowGitignoreModal).toHaveBeenCalledWith(false)
    expect(state.setPendingGenerate).toHaveBeenCalledWith(false)
  })

  it('handleGenerateReview sets error when no agentPtyId', async () => {
    const state = makeState()
    const session = makeSession({ agentPtyId: undefined })

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handleGenerateReview()
    })

    expect(state.setError).toHaveBeenCalledWith('No agent terminal found. Wait for the agent to start.')
  })

  it('handleGenerateReview shows gitignore modal when not in gitignore', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false)

    const state = makeState()
    const session = makeSession()

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handleGenerateReview()
    })

    expect(state.setPendingGenerate).toHaveBeenCalledWith(true)
    expect(state.setShowGitignoreModal).toHaveBeenCalledWith(true)
  })

  it('handleGenerateReview proceeds when .broomy/.gitignore has output/', async () => {
    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      if (path.includes('.broomy/.gitignore')) return true
      return true
    })
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path.includes('.broomy/.gitignore')) return '/output/\n'
      return ''
    })

    const state = makeState()
    const session = makeSession()

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handleGenerateReview()
    })

    const { sendAgentPrompt } = await import('../../utils/focusHelpers')
    expect(state.setWaitingForAgent).toHaveBeenCalledWith(true)
    expect(sendAgentPrompt).toHaveBeenCalled()
  })

  it('handleGenerateReview fetches base branch before generating', async () => {
    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      if (path.includes('.broomy/.gitignore')) return true
      return true
    })
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path.includes('.broomy/.gitignore')) return '/output/\n'
      return ''
    })

    const state = makeState()
    const session = makeSession({ prBaseBranch: 'develop' })

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handleGenerateReview()
    })

    expect(window.git.fetchBranch).toHaveBeenCalledWith('/test/repo', 'develop')
  })

  it('handleGenerateReview pulls PR branch when prNumber is set', async () => {
    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      if (path.includes('.broomy/.gitignore')) return true
      return true
    })
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path.includes('.broomy/.gitignore')) return '/output/\n'
      return ''
    })
    vi.mocked(window.git.getBranch).mockResolvedValue('feature/review')

    const state = makeState()
    const session = makeSession({ prNumber: 42 })

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handleGenerateReview()
    })

    expect(window.git.syncReviewBranch).toHaveBeenCalledWith('/test/repo', 'feature/review', 42)
  })

  it('handleGenerateReview handles generation error', async () => {
    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      if (path.includes('.broomy/.gitignore')) return true
      return true
    })
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path.includes('.broomy/.gitignore')) return '/output/\n'
      return ''
    })
    vi.mocked(window.fs.mkdir).mockRejectedValue(new Error('mkdir failed'))

    const state = makeState()
    const session = makeSession()

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handleGenerateReview()
    })

    expect(state.setError).toHaveBeenCalledWith('mkdir failed')
    expect(state.setWaitingForAgent).toHaveBeenCalledWith(false)
  })

  it('handleGitignoreAdd adds to gitignore and proceeds', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false)
    vi.mocked(window.fs.mkdir).mockResolvedValue({ success: true })

    const state = makeState()
    const session = makeSession()

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handleGitignoreAdd()
    })

    expect(window.fs.mkdir).toHaveBeenCalled()
    expect(window.fs.writeFile).toHaveBeenCalledWith(
      '/test/repo/.broomy/.gitignore',
      '# Broomy generated files\n/output/\n'
    )
    expect(state.setWaitingForAgent).toHaveBeenCalledWith(true)
  })

  it('handleGitignoreContinue proceeds without adding to gitignore', async () => {
    const state = makeState()
    const session = makeSession()

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handleGitignoreContinue()
    })

    expect(state.setShowGitignoreModal).toHaveBeenCalledWith(false)
    expect(state.setWaitingForAgent).toHaveBeenCalledWith(true)
  })

  it('handleOpenPrUrl does nothing when no prUrl', () => {
    const openSpy = vi.fn()
    vi.stubGlobal('open', openSpy)

    const session = makeSession({ prUrl: undefined })
    const state = makeState()

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, vi.fn(), state)
    )

    act(() => {
      result.current.handleOpenPrUrl()
    })

    expect(openSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('addToGitignore creates new .broomy/.gitignore when none exists', async () => {
    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      if (path.includes('.gitignore')) return false
      return false
    })

    const state = makeState()
    const session = makeSession()

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handleGitignoreAdd()
    })

    expect(window.fs.writeFile).toHaveBeenCalledWith(
      '/test/repo/.broomy/.gitignore',
      '# Broomy generated files\n/output/\n'
    )
  })

  it('handleGenerateReview writes context.json with PR info', async () => {
    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      if (path.includes('.broomy/.gitignore')) return true
      return true
    })
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path.includes('.broomy/.gitignore')) return '/output/\n'
      return ''
    })
    vi.mocked(window.fs.mkdir).mockResolvedValue({ success: true })

    const state = makeState()
    const session = makeSession({ prNumber: 42, prBaseBranch: 'main', prUrl: 'https://github.com/pr/42' })

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handleGenerateReview()
    })

    expect(window.fs.writeFile).toHaveBeenCalledWith(
      '/test/repo/.broomy/output/context.json',
      expect.stringContaining('"prNumber": 42')
    )
  })

  it('handleGenerateReview skips gitignore modal when .broomy is in repo .gitignore', async () => {
    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      if (path === '/test/repo/.gitignore') return true
      if (path.includes('.broomy/.gitignore')) return false
      return true
    })
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path === '/test/repo/.gitignore') return '# stuff\n.broomy/\n'
      return ''
    })

    const state = makeState()
    const session = makeSession()

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handleGenerateReview()
    })

    // Should NOT show gitignore modal (only called with false during proceedWithGeneration, never with true)
    expect(state.setShowGitignoreModal).not.toHaveBeenCalledWith(true)
    // Should proceed with generation
    expect(state.setWaitingForAgent).toHaveBeenCalledWith(true)
  })

  it('handleGenerateReview writes review prompt', async () => {
    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      if (path.includes('.broomy/.gitignore')) return true
      return true
    })
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path.includes('.broomy/.gitignore')) return '/output/\n'
      return ''
    })
    vi.mocked(window.fs.mkdir).mockResolvedValue({ success: true })

    const state = makeState()
    const session = makeSession()

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handleGenerateReview()
    })

    expect(window.fs.writeFile).toHaveBeenCalledWith(
      '/test/repo/.broomy/output/review-prompt.md',
      expect.stringContaining('PR Review')
    )
  })
})
