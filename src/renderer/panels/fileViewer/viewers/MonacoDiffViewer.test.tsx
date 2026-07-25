// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act, fireEvent } from '@testing-library/react'
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
    EditorOption: { lineHeight: 66 },
    MouseTargetType: { UNKNOWN: 0 },
  },
  Range: class {
    constructor(public startLineNumber: number, public startColumn: number, public endLineNumber: number, public endColumn: number) {}
  },
}))

import MonacoDiffViewer from './MonacoDiffViewer'

// jsdom has no ResizeObserver; useCommentBox uses one to keep the view zone's
// height in sync with the rendered box, so opening the box needs a stub.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', MockResizeObserver)

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

    const makeModifiedEditor = () => {
      const domNode = document.createElement('div')
      return {
        updateOptions: vi.fn(),
        revealLineInCenter: vi.fn(),
        setPosition: vi.fn(),
        addAction: vi.fn(),
        createDecorationsCollection: vi.fn().mockReturnValue({ set: vi.fn(), clear: vi.fn() }),
        // Real Monaco event registration methods return an IDisposable; attach()
        // stores these and calls .dispose() on unmount, so the mocks must too.
        onMouseMove: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        onMouseLeave: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        onDidScrollChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        getDomNode: vi.fn(() => domNode),
        getTopForLineNumber: vi.fn(() => 100),
        getScrollTop: vi.fn(() => 0),
        getOption: vi.fn(() => 18),
        getLayoutInfo: vi.fn(() => ({ contentLeft: 64 })),
        changeViewZones: vi.fn(),
        getModel: vi.fn().mockReturnValue({ getLineContent: vi.fn().mockReturnValue('  const total = a + b') }),
      }
    }

    const mountWith = (modifiedEditor: ReturnType<typeof makeModifiedEditor>) => {
      const onMountHandler = mockDiffEditor.mock.calls[0][0].onMount as (e: unknown) => void
      onMountHandler({
        getModifiedEditor: vi.fn().mockReturnValue(modifiedEditor),
        onDidUpdateDiff: vi.fn(() => ({ dispose: vi.fn() })),
      })
    }

    it('opens the inline comment box in a view zone when the "+" button is clicked', () => {
      const { container } = render(
        <MonacoDiffViewer filePath="/test/file.ts" originalContent="" modifiedContent="" commentsContext={COMMENTS_CONTEXT} />
      )
      const modifiedEditor = makeModifiedEditor()
      // The "+" button is portaled into modifiedEditor.getDomNode() — attach it
      // to the render tree so React's delegated click event fires on it.
      container.appendChild(modifiedEditor.getDomNode())
      let capturedZone: { afterLineNumber: number; domNode: HTMLDivElement } | undefined
      modifiedEditor.changeViewZones = vi.fn((cb: (a: { addZone: (z: { afterLineNumber: number; domNode: HTMLDivElement }) => string; removeZone: () => void }) => void) => {
        cb({ addZone: (zone) => { capturedZone = zone; return 'zone-1' }, removeZone: vi.fn() })
      })
      mountWith(modifiedEditor)

      const mouseMoveHandler = modifiedEditor.onMouseMove.mock.calls[0][0]
      act(() => {
        mouseMoveHandler({ target: { type: 1, position: { lineNumber: 9 } }, event: { browserEvent: { clientX: 10 } } })
      })
      const plusButton = container.querySelector<HTMLButtonElement>('button[aria-label="Comment on line 9"]')!
      expect(plusButton).toBeTruthy()
      act(() => {
        fireEvent.click(plusButton)
      })

      expect(capturedZone).toBeDefined()
      expect(capturedZone!.afterLineNumber).toBe(9)
      expect(capturedZone!.domNode.textContent).toContain('Line 9')
      expect(capturedZone!.domNode.textContent).toContain('const total = a + b')
      expect(capturedZone!.domNode.querySelector('textarea[placeholder="Add a comment..."]')).toBeTruthy()
    })

    it('shows the "+" affordance over the hovered line on the modified editor and clears it on mouse leave', () => {
      const { container } = render(
        <MonacoDiffViewer filePath="/test/file.ts" originalContent="" modifiedContent="" commentsContext={COMMENTS_CONTEXT} />
      )
      const modifiedEditor = makeModifiedEditor()
      container.appendChild(modifiedEditor.getDomNode())
      mountWith(modifiedEditor)

      const mouseMoveHandler = modifiedEditor.onMouseMove.mock.calls[0][0]
      act(() => {
        mouseMoveHandler({ target: { type: 1, position: { lineNumber: 4 } }, event: { browserEvent: { clientX: 10 } } })
      })
      expect(container.querySelector('button[aria-label="Comment on line 4"]')).toBeTruthy()

      // Hovering off any line (no position) hides it.
      act(() => {
        mouseMoveHandler({ target: { type: 1, position: null }, event: { browserEvent: { clientX: 10 } } })
      })
      expect(container.querySelector('button[aria-label^="Comment on line"]')).toBeNull()

      // Re-show it, then hide via mouse leave.
      act(() => {
        mouseMoveHandler({ target: { type: 1, position: { lineNumber: 4 } }, event: { browserEvent: { clientX: 10 } } })
      })
      expect(container.querySelector('button[aria-label^="Comment on line"]')).toBeTruthy()
      const mouseLeaveHandler = modifiedEditor.onMouseLeave.mock.calls[0][0]
      act(() => {
        mouseLeaveHandler()
      })
      expect(container.querySelector('button[aria-label^="Comment on line"]')).toBeNull()
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
