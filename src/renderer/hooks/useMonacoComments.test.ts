// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMonacoComments } from './useMonacoComments'

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

describe('useMonacoComments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(window.fs.exists).mockResolvedValue(true as never)
    vi.mocked(window.fs.readFile).mockResolvedValue('[]')
    vi.mocked(window.fs.writeFile).mockResolvedValue({ success: true } as never)
    vi.mocked(window.fs.mkdir).mockResolvedValue({ success: true } as never)
  })

  const defaultParams = {
    filePath: 'src/foo.ts',
    reviewContext: undefined,
    editorRef: { current: null },
  }

  it('returns initial state with null commentLine and empty text', () => {
    const { result } = renderHook(() => useMonacoComments(defaultParams))
    expect(result.current.commentLine).toBeNull()
    expect(result.current.commentText).toBe('')
    expect(result.current.existingComments).toEqual([])
  })

  it('allows setting commentLine and commentText', () => {
    const { result } = renderHook(() => useMonacoComments(defaultParams))

    act(() => { result.current.setCommentLine(5) })
    expect(result.current.commentLine).toBe(5)

    act(() => { result.current.setCommentText('Fix this bug') })
    expect(result.current.commentText).toBe('Fix this bug')
  })

  describe('loading existing comments', () => {
    it('loads and filters comments for the current file', async () => {
      const comments = [
        { id: 'c1', file: 'src/foo.ts', line: 10, body: 'Comment on foo', createdAt: '2024-01-01' },
        { id: 'c2', file: 'src/bar.ts', line: 5, body: 'Comment on bar', createdAt: '2024-01-01' },
      ]
      vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify(comments))

      const { result } = renderHook(() =>
        useMonacoComments({
          filePath: 'src/foo.ts',
          reviewContext: { sessionDirectory: '/tmp/session', commentsFilePath: '/tmp/session/comments.json' },
          editorRef: { current: null },
        }),
      )

      // Wait for the async load to complete
      await vi.waitFor(() => {
        expect(result.current.existingComments).toHaveLength(1)
      })
      expect(result.current.existingComments[0].id).toBe('c1')
      expect(result.current.existingComments[0].file).toBe('src/foo.ts')
    })

    it('does not load comments when reviewContext is undefined', async () => {
      const { result } = renderHook(() =>
        useMonacoComments({
          filePath: 'src/foo.ts',
          reviewContext: undefined,
          editorRef: { current: null },
        }),
      )

      // Give it a tick to ensure no load happens
      await new Promise((r) => setTimeout(r, 10))
      expect(result.current.existingComments).toEqual([])
      expect(window.fs.readFile).not.toHaveBeenCalled()
    })

    it('handles missing comments file gracefully', async () => {
      vi.mocked(window.fs.exists).mockResolvedValue(false as never)

      const { result } = renderHook(() =>
        useMonacoComments({
          filePath: 'src/foo.ts',
          reviewContext: { sessionDirectory: '/tmp/session', commentsFilePath: '/tmp/session/comments.json' },
          editorRef: { current: null },
        }),
      )

      await new Promise((r) => setTimeout(r, 10))
      expect(result.current.existingComments).toEqual([])
    })

    it('handles read errors gracefully', async () => {
      vi.mocked(window.fs.exists).mockResolvedValue(true as never)
      vi.mocked(window.fs.readFile).mockRejectedValue(new Error('read error'))

      const { result } = renderHook(() =>
        useMonacoComments({
          filePath: 'src/foo.ts',
          reviewContext: { sessionDirectory: '/tmp/session', commentsFilePath: '/tmp/session/comments.json' },
          editorRef: { current: null },
        }),
      )

      await new Promise((r) => setTimeout(r, 10))
      expect(result.current.existingComments).toEqual([])
    })
  })

  describe('handleAddComment', () => {
    it('does nothing when reviewContext is undefined', async () => {
      const { result } = renderHook(() =>
        useMonacoComments({ filePath: 'src/foo.ts', reviewContext: undefined, editorRef: { current: null } }),
      )

      act(() => { result.current.setCommentLine(5) })
      act(() => { result.current.setCommentText('A comment') })

      await act(async () => { await result.current.handleAddComment() })
      expect(window.fs.writeFile).not.toHaveBeenCalled()
    })

    it('does nothing when commentLine is null', async () => {
      const { result } = renderHook(() =>
        useMonacoComments({
          filePath: 'src/foo.ts',
          reviewContext: { sessionDirectory: '/tmp/session', commentsFilePath: '/tmp/session/comments.json' },
          editorRef: { current: null },
        }),
      )

      act(() => { result.current.setCommentText('A comment') })
      // commentLine is still null
      await act(async () => { await result.current.handleAddComment() })
      expect(window.fs.writeFile).not.toHaveBeenCalled()
    })

    it('does nothing when commentText is empty or whitespace', async () => {
      const { result } = renderHook(() =>
        useMonacoComments({
          filePath: 'src/foo.ts',
          reviewContext: { sessionDirectory: '/tmp/session', commentsFilePath: '/tmp/session/comments.json' },
          editorRef: { current: null },
        }),
      )

      act(() => { result.current.setCommentLine(5) })
      act(() => { result.current.setCommentText('   ') })

      await act(async () => { await result.current.handleAddComment() })
      expect(window.fs.writeFile).not.toHaveBeenCalled()
    })

    it('adds a new comment, writes to file, and resets state', async () => {
      vi.mocked(window.fs.exists).mockResolvedValue(false as never)
      vi.mocked(window.fs.readFile).mockResolvedValue('[]')

      const { result } = renderHook(() =>
        useMonacoComments({
          filePath: 'src/foo.ts',
          reviewContext: { sessionDirectory: '/tmp/session', commentsFilePath: '/tmp/session/comments.json' },
          editorRef: { current: null },
        }),
      )

      act(() => { result.current.setCommentLine(10) })
      act(() => { result.current.setCommentText('Fix this line') })

      await act(async () => { await result.current.handleAddComment() })

      // Should have written the file
      expect(window.fs.mkdir).toHaveBeenCalledWith('/tmp/session')
      expect(window.fs.writeFile).toHaveBeenCalledWith(
        '/tmp/session/comments.json',
        expect.stringContaining('"Fix this line"'),
      )

      // State should be reset
      expect(result.current.commentLine).toBeNull()
      expect(result.current.commentText).toBe('')

      // Existing comments should now include the new one
      expect(result.current.existingComments).toHaveLength(1)
      expect(result.current.existingComments[0].body).toBe('Fix this line')
      expect(result.current.existingComments[0].file).toBe('src/foo.ts')
      expect(result.current.existingComments[0].line).toBe(10)
    })

    it('appends to existing comments when file already has comments', async () => {
      const existingComments = [
        { id: 'c1', file: 'src/foo.ts', line: 1, body: 'Old comment', createdAt: '2024-01-01' },
      ]
      // First call for initial load (exists check), second for add (exists check)
      vi.mocked(window.fs.exists).mockResolvedValue(true as never)
      vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify(existingComments))

      const { result } = renderHook(() =>
        useMonacoComments({
          filePath: 'src/foo.ts',
          reviewContext: { sessionDirectory: '/tmp/session', commentsFilePath: '/tmp/session/comments.json' },
          editorRef: { current: null },
        }),
      )

      // Wait for initial load
      await vi.waitFor(() => {
        expect(result.current.existingComments).toHaveLength(1)
      })

      act(() => { result.current.setCommentLine(20) })
      act(() => { result.current.setCommentText('New comment') })

      await act(async () => { await result.current.handleAddComment() })

      // The written JSON should contain 2 comments
      const writeCall = vi.mocked(window.fs.writeFile).mock.calls[0]
      const writtenData = writeCall[1]
      const writtenComments = JSON.parse(typeof writtenData === 'string' ? writtenData : '')
      expect(writtenComments).toHaveLength(2)
      expect(writtenComments[0].body).toBe('Old comment')
      expect(writtenComments[1].body).toBe('New comment')
    })

    it('handles write errors gracefully', async () => {
      vi.mocked(window.fs.exists).mockResolvedValue(false as never)
      vi.mocked(window.fs.mkdir).mockRejectedValue(new Error('mkdir failed'))

      const { result } = renderHook(() =>
        useMonacoComments({
          filePath: 'src/foo.ts',
          reviewContext: { sessionDirectory: '/tmp/session', commentsFilePath: '/tmp/session/comments.json' },
          editorRef: { current: null },
        }),
      )

      act(() => { result.current.setCommentLine(10) })
      act(() => { result.current.setCommentText('A comment') })

      // Should not throw
      await act(async () => { await result.current.handleAddComment() })

      // State should NOT be reset when save fails
      // (the comment was not added because mkdir threw before writeFile)
      expect(result.current.existingComments).toEqual([])
    })
  })

  describe('comment decorations', () => {
    it('creates decorations when existingComments and editor are available', async () => {
      const mockClear = vi.fn()
      const mockCreateDecorationsCollection = vi.fn().mockReturnValue({ clear: mockClear })
      const mockEditor = {
        getModel: vi.fn().mockReturnValue({}),
        createDecorationsCollection: mockCreateDecorationsCollection,
      }

      const comments = [
        { id: 'c1', file: 'src/foo.ts', line: 10, body: 'Comment here', createdAt: '2024-01-01' },
      ]
      vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify(comments))

      const editorRef = { current: mockEditor as never }

      const { result } = renderHook(() =>
        useMonacoComments({
          filePath: 'src/foo.ts',
          reviewContext: { sessionDirectory: '/tmp/session', commentsFilePath: '/tmp/session/comments.json' },
          editorRef,
        }),
      )

      await vi.waitFor(() => {
        expect(result.current.existingComments).toHaveLength(1)
      })

      // Decorations should have been created - check the last call since the
      // effect may first run with empty comments, then again after loading
      expect(mockCreateDecorationsCollection).toHaveBeenCalled()
      const lastCallIndex = mockCreateDecorationsCollection.mock.calls.length - 1
      const decorations = mockCreateDecorationsCollection.mock.calls[lastCallIndex][0]
      expect(decorations).toHaveLength(1)
      expect(decorations[0].options.isWholeLine).toBe(true)
      expect(decorations[0].options.glyphMarginClassName).toBe('review-comment-glyph')
      expect(decorations[0].options.glyphMarginHoverMessage.value).toBe('Comment here')
    })

    it('clears previous decorations when comments change', async () => {
      const mockClear = vi.fn()
      const mockCreateDecorationsCollection = vi.fn().mockReturnValue({ clear: mockClear })
      const mockEditor = {
        getModel: vi.fn().mockReturnValue({}),
        createDecorationsCollection: mockCreateDecorationsCollection,
      }

      vi.mocked(window.fs.exists).mockResolvedValue(false as never)

      const editorRef = { current: mockEditor as never }

      const { result } = renderHook(() =>
        useMonacoComments({
          filePath: 'src/foo.ts',
          reviewContext: { sessionDirectory: '/tmp/session', commentsFilePath: '/tmp/session/comments.json' },
          editorRef,
        }),
      )

      // Add a comment to trigger decoration update
      act(() => { result.current.setCommentLine(5) })
      act(() => { result.current.setCommentText('New comment') })
      await act(async () => { await result.current.handleAddComment() })

      // After the first decoration collection was created and then comments changed,
      // the old one should have been cleared
      if (mockCreateDecorationsCollection.mock.calls.length > 1) {
        expect(mockClear).toHaveBeenCalled()
      }
    })

    it('skips decorations when editor has no model', async () => {
      const mockCreateDecorationsCollection = vi.fn()
      const mockEditor = {
        getModel: vi.fn().mockReturnValue(null),
        createDecorationsCollection: mockCreateDecorationsCollection,
      }

      const comments = [
        { id: 'c1', file: 'src/foo.ts', line: 10, body: 'Comment', createdAt: '2024-01-01' },
      ]
      vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify(comments))

      renderHook(() =>
        useMonacoComments({
          filePath: 'src/foo.ts',
          reviewContext: { sessionDirectory: '/tmp/session', commentsFilePath: '/tmp/session/comments.json' },
          editorRef: { current: mockEditor as never },
        }),
      )

      await new Promise((r) => setTimeout(r, 10))
      expect(mockCreateDecorationsCollection).not.toHaveBeenCalled()
    })
  })
})
