// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import '../../../../test/react-setup'

// Mock @monaco-editor/react and monaco-editor to avoid loading real Monaco
const mockDiffEditor = vi.fn().mockReturnValue(null)
vi.mock('@monaco-editor/react', () => ({
  DiffEditor: (props: Record<string, unknown>) => {
    mockDiffEditor(props)
    return null
  },
  loader: { config: vi.fn() },
}))

vi.mock('monaco-editor', () => ({
  editor: {
    defineTheme: vi.fn(),
    MouseTargetType: { GUTTER_GLYPH_MARGIN: 2 },
  },
  Range: class {
    constructor(public startLineNumber: number, public startColumn: number, public endLineNumber: number, public endColumn: number) {}
  },
}))

import MonacoDiffViewer from './MonacoDiffViewer'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MonacoDiffViewer', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <MonacoDiffViewer
        filePath="/test/file.ts"
        originalContent="const a = 1"
        modifiedContent="const a = 2"
      />
    )
    expect(container.querySelector('.h-full')).toBeTruthy()
  })

  it('passes correct language for typescript', () => {
    render(
      <MonacoDiffViewer
        filePath="/test/file.ts"
        originalContent=""
        modifiedContent=""
      />
    )
    expect(mockDiffEditor).toHaveBeenCalledWith(
      expect.objectContaining({
        language: 'typescript',
        theme: 'broomy-dark',
      })
    )
  })

  it('passes correct language for python', () => {
    render(
      <MonacoDiffViewer
        filePath="/test/script.py"
        originalContent=""
        modifiedContent=""
      />
    )
    expect(mockDiffEditor).toHaveBeenCalledWith(
      expect.objectContaining({
        language: 'python',
      })
    )
  })

  it('falls back to plaintext for unknown extensions', () => {
    render(
      <MonacoDiffViewer
        filePath="/test/file.xyz"
        originalContent=""
        modifiedContent=""
      />
    )
    expect(mockDiffEditor).toHaveBeenCalledWith(
      expect.objectContaining({
        language: 'plaintext',
      })
    )
  })

  it('passes original and modified content', () => {
    render(
      <MonacoDiffViewer
        filePath="/test/file.ts"
        originalContent="original code"
        modifiedContent="modified code"
      />
    )
    expect(mockDiffEditor).toHaveBeenCalledWith(
      expect.objectContaining({
        original: 'original code',
        modified: 'modified code',
      })
    )
  })

  it('uses language prop over detected language', () => {
    render(
      <MonacoDiffViewer
        filePath="/test/file.ts"
        originalContent=""
        modifiedContent=""
        language="javascript"
      />
    )
    expect(mockDiffEditor).toHaveBeenCalledWith(
      expect.objectContaining({
        language: 'javascript',
      })
    )
  })

  it('passes sideBySide option', () => {
    render(
      <MonacoDiffViewer
        filePath="/test/file.ts"
        originalContent=""
        modifiedContent=""
        sideBySide={false}
      />
    )
    expect(mockDiffEditor).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          renderSideBySide: false,
        }),
      })
    )
  })

  it('enables word wrap on both diff panes', () => {
    render(
      <MonacoDiffViewer
        filePath="/test/file.ts"
        originalContent=""
        modifiedContent=""
      />
    )
    expect(mockDiffEditor).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          wordWrap: 'on',
          diffWordWrap: 'on',
          // Prevents Monaco from silently flipping to inline mode below 900px,
          // which would set wordWrapOverride2: 'off' on the original editor
          // and leave the left pane un-wrapped.
          useInlineViewWhenSpaceIsLimited: false,
        }),
      })
    )
  })

  it('calls scroll to line on mount when scrollToLine is provided', () => {
    render(
      <MonacoDiffViewer
        filePath="/test/file.ts"
        originalContent=""
        modifiedContent=""
        scrollToLine={42}
      />
    )
    // Get the onMount handler
    const onMountHandler = mockDiffEditor.mock.calls[0][0].onMount
    expect(onMountHandler).toBeDefined()

    const mockOriginalEditor = { updateOptions: vi.fn() }
    const mockModifiedEditor = {
      revealLineInCenter: vi.fn(),
      setPosition: vi.fn(),
      updateOptions: vi.fn(),
    }
    let diffCallback: (() => void) | null = null
    const mockEditorInstance = {
      getOriginalEditor: vi.fn().mockReturnValue(mockOriginalEditor),
      getModifiedEditor: vi.fn().mockReturnValue(mockModifiedEditor),
      onDidUpdateDiff: vi.fn((cb: () => void) => {
        diffCallback = cb
        return { dispose: vi.fn() }
      }),
    }
    onMountHandler(mockEditorInstance)

    // Scroll happens inside the onDidUpdateDiff callback, not immediately
    expect(mockModifiedEditor.revealLineInCenter).not.toHaveBeenCalled()

    // Simulate diff computation completing
    diffCallback!()

    expect(mockModifiedEditor.revealLineInCenter).toHaveBeenCalledWith(42)
    expect(mockModifiedEditor.setPosition).toHaveBeenCalledWith({ lineNumber: 42, column: 1 })
  })

  it('does not scroll on mount when scrollToLine is not provided', () => {
    render(
      <MonacoDiffViewer
        filePath="/test/file.ts"
        originalContent=""
        modifiedContent=""
      />
    )
    const onMountHandler = mockDiffEditor.mock.calls[0][0].onMount
    const mockOriginalEditor = { updateOptions: vi.fn() }
    const mockModifiedEditor = {
      revealLineInCenter: vi.fn(),
      setPosition: vi.fn(),
      updateOptions: vi.fn(),
    }
    const mockEditorInstance = {
      getOriginalEditor: vi.fn().mockReturnValue(mockOriginalEditor),
      getModifiedEditor: vi.fn().mockReturnValue(mockModifiedEditor),

    }
    onMountHandler(mockEditorInstance)

    expect(mockModifiedEditor.revealLineInCenter).not.toHaveBeenCalled()
  })

  describe('inline comments', () => {
    const COMMENTS_CONTEXT = { sessionDirectory: '/test', commentsFilePath: '/test/.broomy/comments.json' }

    const makeModifiedEditor = () => ({
      updateOptions: vi.fn(),
      revealLineInCenter: vi.fn(),
      setPosition: vi.fn(),
      createDecorationsCollection: vi.fn().mockReturnValue({ set: vi.fn(), clear: vi.fn() }),
      onMouseMove: vi.fn(),
      onMouseLeave: vi.fn(),
      onMouseDown: vi.fn(),
      changeViewZones: vi.fn(),
      getModel: vi.fn().mockReturnValue({ getLineContent: vi.fn().mockReturnValue('  const total = a + b') }),
    })

    const mountWith = (modifiedEditor: ReturnType<typeof makeModifiedEditor>) => {
      const onMountHandler = mockDiffEditor.mock.calls[0][0].onMount as (e: unknown) => void
      onMountHandler({
        getModifiedEditor: vi.fn().mockReturnValue(modifiedEditor),
        onDidUpdateDiff: vi.fn(() => ({ dispose: vi.fn() })),
      })
    }

    it('opens the inline comment box in a view zone when the modified gutter is clicked', () => {
      render(
        <MonacoDiffViewer filePath="/test/file.ts" originalContent="" modifiedContent="" commentsContext={COMMENTS_CONTEXT} />
      )
      const modifiedEditor = makeModifiedEditor()
      let capturedZone: { afterLineNumber: number; domNode: HTMLDivElement } | undefined
      modifiedEditor.changeViewZones = vi.fn((cb: (a: { addZone: (z: { afterLineNumber: number; domNode: HTMLDivElement }) => string; removeZone: () => void }) => void) => {
        cb({ addZone: (zone) => { capturedZone = zone; return 'zone-1' }, removeZone: vi.fn() })
      })
      mountWith(modifiedEditor)

      expect(modifiedEditor.updateOptions).toHaveBeenCalledWith({ glyphMargin: true })
      const mouseDownHandler = modifiedEditor.onMouseDown.mock.calls[0][0]
      act(() => {
        mouseDownHandler({ target: { type: 2, position: { lineNumber: 9 } } })
      })

      expect(capturedZone).toBeDefined()
      expect(capturedZone!.afterLineNumber).toBe(9)
      expect(capturedZone!.domNode.textContent).toContain('Line 9')
      expect(capturedZone!.domNode.textContent).toContain('const total = a + b')
      expect(capturedZone!.domNode.querySelector('textarea[placeholder="Add a comment..."]')).toBeTruthy()
    })

    it('shows the hover affordance on the modified gutter and clears it off-margin and on leave', () => {
      render(
        <MonacoDiffViewer filePath="/test/file.ts" originalContent="" modifiedContent="" commentsContext={COMMENTS_CONTEXT} />
      )
      const modifiedEditor = makeModifiedEditor()
      const hoverCollection = { set: vi.fn(), clear: vi.fn() }
      modifiedEditor.createDecorationsCollection = vi.fn().mockReturnValue(hoverCollection)
      mountWith(modifiedEditor)

      const mouseMoveHandler = modifiedEditor.onMouseMove.mock.calls[0][0]
      mouseMoveHandler({ target: { type: 2, position: { lineNumber: 4 } } })
      expect(hoverCollection.set).toHaveBeenCalledWith([
        expect.objectContaining({ options: expect.objectContaining({ glyphMarginClassName: 'add-comment-glyph' }) }),
      ])

      mouseMoveHandler({ target: { type: 0, position: { lineNumber: 4 } } })
      expect(hoverCollection.clear).toHaveBeenCalled()

      const mouseLeaveHandler = modifiedEditor.onMouseLeave.mock.calls[0][0]
      mouseLeaveHandler()
      expect(hoverCollection.clear).toHaveBeenCalledTimes(2)
    })
  })

  it('defaults sideBySide to true', () => {
    render(
      <MonacoDiffViewer
        filePath="/test/file.ts"
        originalContent=""
        modifiedContent=""
      />
    )
    expect(mockDiffEditor).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          renderSideBySide: true,
        }),
      })
    )
  })
})
