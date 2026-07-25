// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor, cleanup } from '@testing-library/react'
import { useMonacoComments } from './useMonacoComments'
import { useCommentsStore } from '../../../store/comments'

// Mock monaco-editor
vi.mock('monaco-editor', () => ({
  Range: class Range {
    constructor(
      public startLineNumber: number,
      public startColumn: number,
      public endLineNumber: number,
      public endColumn: number,
    ) {}
  },
}))

function resetStore() {
  useCommentsStore.setState({ commentsByDir: {} })
}

describe('useMonacoComments', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
    vi.mocked(window.fs.exists).mockResolvedValue(false as never)
    vi.mocked(window.fs.readFile).mockResolvedValue('[]')
    vi.mocked(window.fs.writeFile).mockResolvedValue({ success: true } as never)
    vi.mocked(window.fs.mkdir).mockResolvedValue({ success: true } as never)
  })

  const defaultParams = {
    filePath: 'src/foo.ts',
    commentsContext: undefined,
    editorRef: { current: null },
  }

  it('returns an empty existingComments array with no commentsContext', () => {
    const { result } = renderHook(() => useMonacoComments(defaultParams))
    expect(result.current.existingComments).toEqual([])
  })

  describe('existingComments', () => {
    it('returns only comments for the current file in the session dir', async () => {
      useCommentsStore.setState({
        commentsByDir: {
          '/tmp/session': [
            { id: 'c1', file: 'src/foo.ts', line: 10, quotedText: 'const x = 1', body: 'Comment on foo', createdAt: '2024-01-01' },
            { id: 'c2', file: 'src/bar.ts', line: 5, quotedText: 'const y = 2', body: 'Comment on bar', createdAt: '2024-01-01' },
          ],
        },
      })

      const { result } = renderHook(() =>
        useMonacoComments({
          filePath: 'src/foo.ts',
          commentsContext: { sessionDirectory: '/tmp/session', commentsFilePath: '/tmp/session/comments.json' },
          editorRef: { current: null },
        }),
      )

      expect(result.current.existingComments).toHaveLength(1)
      expect(result.current.existingComments[0].id).toBe('c1')
      expect(result.current.existingComments[0].file).toBe('src/foo.ts')
    })

    it('loads comments for the session dir when not already loaded', async () => {
      vi.mocked(window.fs.exists).mockResolvedValue(true as never)
      vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify([
        { id: 'c1', file: 'src/foo.ts', line: 10, quotedText: 'const x = 1', body: 'Loaded comment', createdAt: '2024-01-01' },
      ]))

      const { result } = renderHook(() =>
        useMonacoComments({
          filePath: 'src/foo.ts',
          commentsContext: { sessionDirectory: '/tmp/session', commentsFilePath: '/tmp/session/comments.json' },
          editorRef: { current: null },
        }),
      )

      await waitFor(() => {
        expect(result.current.existingComments).toHaveLength(1)
      })
      expect(result.current.existingComments[0].body).toBe('Loaded comment')
      expect(window.fs.readFile).toHaveBeenCalledWith('/tmp/session/.broomy/comments.json')
    })

    it('does not load comments when commentsContext is undefined', async () => {
      renderHook(() =>
        useMonacoComments({
          filePath: 'src/foo.ts',
          commentsContext: undefined,
          editorRef: { current: null },
        }),
      )

      await new Promise((r) => setTimeout(r, 10))
      expect(window.fs.readFile).not.toHaveBeenCalled()
    })
  })

  describe('addCommentAt', () => {
    it('does nothing when commentsContext is undefined (no session dir)', () => {
      const { result } = renderHook(() =>
        useMonacoComments({ filePath: 'src/foo.ts', commentsContext: undefined, editorRef: { current: null } }),
      )

      act(() => { result.current.addCommentAt(5, 'A comment') })
      expect(window.fs.writeFile).not.toHaveBeenCalled()
    })

    it('does nothing when body is empty or whitespace', () => {
      const { result } = renderHook(() =>
        useMonacoComments({
          filePath: 'src/foo.ts',
          commentsContext: { sessionDirectory: '/tmp/session', commentsFilePath: '/tmp/session/comments.json' },
          editorRef: { current: null },
        }),
      )

      act(() => { result.current.addCommentAt(5, '   ') })
      expect(window.fs.writeFile).not.toHaveBeenCalled()
    })

    it('reads the line text from the editor model and calls store addComment with it as quotedText', () => {
      const mockModel = { getLineContent: vi.fn().mockReturnValue('  const total = a + b') }
      const mockEditor = {
        getModel: vi.fn().mockReturnValue(mockModel),
        createDecorationsCollection: vi.fn().mockReturnValue({ clear: vi.fn() }),
      }
      const editorRef = { current: mockEditor as never }

      const { result } = renderHook(() =>
        useMonacoComments({
          filePath: 'src/foo.ts',
          commentsContext: { sessionDirectory: '/tmp/session', commentsFilePath: '/tmp/session/comments.json' },
          editorRef,
        }),
      )

      act(() => { result.current.addCommentAt(10, 'Fix this line') })

      expect(mockModel.getLineContent).toHaveBeenCalledWith(10)
      const stored = useCommentsStore.getState().commentsByDir['/tmp/session']
      expect(stored).toHaveLength(1)
      expect(stored[0]).toMatchObject({
        file: 'src/foo.ts',
        line: 10,
        quotedText: '  const total = a + b',
        body: 'Fix this line',
      })
      expect(window.fs.writeFile).toHaveBeenCalledWith(
        '/tmp/session/.broomy/comments.json',
        expect.stringContaining('"Fix this line"'),
      )
    })

    it('uses an empty quotedText when the editor has no model yet', () => {
      const mockEditor = { getModel: vi.fn().mockReturnValue(null) }
      const editorRef = { current: mockEditor as never }

      const { result } = renderHook(() =>
        useMonacoComments({
          filePath: 'src/foo.ts',
          commentsContext: { sessionDirectory: '/tmp/session', commentsFilePath: '/tmp/session/comments.json' },
          editorRef,
        }),
      )

      act(() => { result.current.addCommentAt(3, 'No model available') })

      const stored = useCommentsStore.getState().commentsByDir['/tmp/session']
      expect(stored[0].quotedText).toBe('')
    })

    it('appends to existing comments for the same session dir', () => {
      useCommentsStore.setState({
        commentsByDir: {
          '/tmp/session': [
            { id: 'c1', file: 'src/foo.ts', line: 1, quotedText: 'old', body: 'Old comment', createdAt: '2024-01-01' },
          ],
        },
      })
      const mockEditor = { getModel: vi.fn().mockReturnValue(null) }
      const editorRef = { current: mockEditor as never }

      const { result } = renderHook(() =>
        useMonacoComments({
          filePath: 'src/foo.ts',
          commentsContext: { sessionDirectory: '/tmp/session', commentsFilePath: '/tmp/session/comments.json' },
          editorRef,
        }),
      )

      act(() => { result.current.addCommentAt(20, 'New comment') })

      const stored = useCommentsStore.getState().commentsByDir['/tmp/session']
      expect(stored).toHaveLength(2)
      expect(stored[0].body).toBe('Old comment')
      expect(stored[1].body).toBe('New comment')
    })
  })

  describe('comment decorations', () => {
    it('creates decorations for existing comments when the editor has a model', () => {
      const mockClear = vi.fn()
      const mockCreateDecorationsCollection = vi.fn().mockReturnValue({ clear: mockClear })
      const mockEditor = {
        getModel: vi.fn().mockReturnValue({}),
        createDecorationsCollection: mockCreateDecorationsCollection,
      }
      useCommentsStore.setState({
        commentsByDir: {
          '/tmp/session': [
            { id: 'c1', file: 'src/foo.ts', line: 10, quotedText: 'x', body: 'Comment here', createdAt: '2024-01-01' },
          ],
        },
      })

      const editorRef = { current: mockEditor as never }

      renderHook(() =>
        useMonacoComments({
          filePath: 'src/foo.ts',
          commentsContext: { sessionDirectory: '/tmp/session', commentsFilePath: '/tmp/session/comments.json' },
          editorRef,
        }),
      )

      expect(mockCreateDecorationsCollection).toHaveBeenCalled()
      const decorations = mockCreateDecorationsCollection.mock.calls[0][0]
      expect(decorations).toHaveLength(1)
      expect(decorations[0].options.isWholeLine).toBe(true)
      expect(decorations[0].options.glyphMarginClassName).toBe('review-comment-glyph')
      expect(decorations[0].options.glyphMarginHoverMessage.value).toBe('Comment here')
    })

    it('skips decorations when editor has no model', () => {
      const mockCreateDecorationsCollection = vi.fn()
      const mockEditor = {
        getModel: vi.fn().mockReturnValue(null),
        createDecorationsCollection: mockCreateDecorationsCollection,
      }
      useCommentsStore.setState({
        commentsByDir: {
          '/tmp/session': [
            { id: 'c1', file: 'src/foo.ts', line: 10, quotedText: 'x', body: 'Comment', createdAt: '2024-01-01' },
          ],
        },
      })

      renderHook(() =>
        useMonacoComments({
          filePath: 'src/foo.ts',
          commentsContext: { sessionDirectory: '/tmp/session', commentsFilePath: '/tmp/session/comments.json' },
          editorRef: { current: mockEditor as never },
        }),
      )

      expect(mockCreateDecorationsCollection).not.toHaveBeenCalled()
    })

    it('skips decorations entirely when commentsContext is undefined', () => {
      const mockCreateDecorationsCollection = vi.fn()
      const mockEditor = {
        getModel: vi.fn().mockReturnValue({}),
        createDecorationsCollection: mockCreateDecorationsCollection,
      }

      renderHook(() =>
        useMonacoComments({
          filePath: 'src/foo.ts',
          commentsContext: undefined,
          editorRef: { current: mockEditor as never },
        }),
      )

      expect(mockCreateDecorationsCollection).not.toHaveBeenCalled()
    })

    it('clears previous decorations before creating new ones', () => {
      const mockClear = vi.fn()
      const mockCreateDecorationsCollection = vi.fn().mockReturnValue({ clear: mockClear })
      const mockEditor = {
        getModel: vi.fn().mockReturnValue({}),
        createDecorationsCollection: mockCreateDecorationsCollection,
      }
      useCommentsStore.setState({
        commentsByDir: {
          '/tmp/session': [
            { id: 'c1', file: 'src/foo.ts', line: 10, quotedText: 'x', body: 'Comment', createdAt: '2024-01-01' },
          ],
        },
      })
      const editorRef = { current: mockEditor as never }

      const { rerender } = renderHook(
        (props) => useMonacoComments(props),
        {
          initialProps: {
            filePath: 'src/foo.ts',
            commentsContext: { sessionDirectory: '/tmp/session', commentsFilePath: '/tmp/session/comments.json' },
            editorRef,
          },
        },
      )

      expect(mockClear).not.toHaveBeenCalled()

      // Trigger the store to change so the decoration effect re-runs.
      useCommentsStore.setState({
        commentsByDir: {
          '/tmp/session': [
            { id: 'c1', file: 'src/foo.ts', line: 10, quotedText: 'x', body: 'Comment', createdAt: '2024-01-01' },
            { id: 'c2', file: 'src/foo.ts', line: 20, quotedText: 'y', body: 'Second', createdAt: '2024-01-01' },
          ],
        },
      })
      rerender({
        filePath: 'src/foo.ts',
        commentsContext: { sessionDirectory: '/tmp/session', commentsFilePath: '/tmp/session/comments.json' },
        editorRef,
      })

      expect(mockClear).toHaveBeenCalled()
      expect(mockCreateDecorationsCollection.mock.calls.length).toBeGreaterThan(1)
      const lastCall = mockCreateDecorationsCollection.mock.calls[mockCreateDecorationsCollection.mock.calls.length - 1]
      expect(lastCall[0]).toHaveLength(2)
    })
  })
})
