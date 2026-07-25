// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act, fireEvent } from '@testing-library/react'
import '../../../../test/react-setup'
import { useCommentsStore } from '../../../store/comments'

// Mock Monaco editor and workers to avoid loading real Monaco
const mockEditor = vi.fn().mockReturnValue(null)
vi.mock('@monaco-editor/react', () => ({
  default: (props: Record<string, unknown>) => {
    mockEditor(props)
    return null
  },
  loader: { config: vi.fn() },
}))

const mockRegisterEditorOpener = vi.fn().mockReturnValue({ dispose: vi.fn() })
vi.mock('monaco-editor', () => ({
  editor: {
    registerEditorOpener: (...args: unknown[]) => mockRegisterEditorOpener(...args),
    // shared/theme/monacoTheme.ts calls this at module scope — it has to, or
    // setTheme() would silently fall back to the builtin light 'vs'.
    defineTheme: vi.fn(),
  },
  Range: vi.fn(),
  KeyMod: { CtrlCmd: 2048 },
  KeyCode: { KeyS: 49 },
}))

vi.mock('monaco-editor/esm/vs/editor/editor.worker?worker', () => ({ default: vi.fn() }))
vi.mock('monaco-editor/esm/vs/language/json/json.worker?worker', () => ({ default: vi.fn() }))
vi.mock('monaco-editor/esm/vs/language/css/css.worker?worker', () => ({ default: vi.fn() }))
vi.mock('monaco-editor/esm/vs/language/html/html.worker?worker', () => ({ default: vi.fn() }))
vi.mock('monaco-editor/esm/vs/language/typescript/ts.worker?worker', () => ({ default: vi.fn() }))

const { addCommentAtSpy } = vi.hoisted(() => ({ addCommentAtSpy: vi.fn() }))
vi.mock('../hooks/useMonacoComments', () => ({
  useMonacoComments: vi.fn().mockReturnValue({
    existingComments: [],
    addCommentAt: addCommentAtSpy,
  }),
}))

import { MonacoViewer } from './MonacoViewer'

const MonacoViewerComponent = MonacoViewer.component

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

function getLastEditorProps() {
  const calls = mockEditor.mock.calls
  return calls[calls.length - 1][0] as Record<string, unknown>
}

function makeMockEditorInstance() {
  // A single stable DOM node — attach() calls getDomNode() once and stores the
  // result, so repeated calls (including from the test itself) must return the
  // same element for the "+" button's portal target to be found.
  const domNode = document.createElement('div')
  return {
    addCommand: vi.fn(),
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
    changeViewZones: vi.fn((cb: (accessor: { addZone: () => string; removeZone: () => void }) => void) =>
      cb({ addZone: () => 'zone-1', removeZone: vi.fn() })),
    focus: vi.fn(),
    trigger: vi.fn(),
    getValue: vi.fn().mockReturnValue('content'),
    revealLineInCenter: vi.fn(),
    getModel: vi.fn().mockReturnValue({
      getLineContent: vi.fn().mockReturnValue('some line content'),
    }),
    setSelection: vi.fn(),
    createDecorationsCollection: vi.fn().mockReturnValue({ clear: vi.fn(), set: vi.fn() }),
  }
}

function makeMockMonaco() {
  return {
    KeyMod: { CtrlCmd: 2048 },
    KeyCode: { KeyS: 49 },
    editor: { EditorOption: { lineHeight: 66 } },
    Range: class Range {
      constructor(
        public startLineNumber: number,
        public startColumn: number,
        public endLineNumber: number,
        public endColumn: number,
      ) {}
    },
  }
}

describe('MonacoViewer plugin', () => {
  it('has correct id and name', () => {
    expect(MonacoViewer.id).toBe('monaco')
    expect(MonacoViewer.name).toBe('Code')
  })

  it('canHandle returns true for known text extensions', () => {
    expect(MonacoViewer.canHandle('file.ts')).toBe(true)
    expect(MonacoViewer.canHandle('file.js')).toBe(true)
    expect(MonacoViewer.canHandle('file.py')).toBe(true)
    expect(MonacoViewer.canHandle('file.json')).toBe(true)
    expect(MonacoViewer.canHandle('file.css')).toBe(true)
  })

  it('canHandle returns true for known filenames without extension', () => {
    expect(MonacoViewer.canHandle('Makefile')).toBe(true)
    expect(MonacoViewer.canHandle('Dockerfile')).toBe(true)
  })

  it('canHandle returns true for unknown files (fallback)', () => {
    expect(MonacoViewer.canHandle('file.unknown')).toBe(true)
  })

  it('has lowest priority', () => {
    expect(MonacoViewer.priority).toBe(1)
  })
})

describe('MonacoViewerComponent', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <MonacoViewerComponent filePath="/test/file.ts" content="const x = 1" />
    )
    expect(container.querySelector('.h-full')).toBeTruthy()
  })

  it('passes correct language for typescript', () => {
    render(
      <MonacoViewerComponent filePath="/test/file.ts" content="" />
    )
    expect(mockEditor).toHaveBeenCalledWith(
      expect.objectContaining({
        language: 'typescript',
        // Both editors read one value from the settings store — Monaco's setTheme is
        // global, so MonacoViewer and MonacoDiffViewer cannot be allowed to disagree.
        theme: 'broomy-dark',
      })
    )
  })

  it('passes correct language for python files', () => {
    render(
      <MonacoViewerComponent filePath="/test/script.py" content="" />
    )
    expect(mockEditor).toHaveBeenCalledWith(
      expect.objectContaining({
        language: 'python',
      })
    )
  })

  it('passes file content as value', () => {
    render(
      <MonacoViewerComponent filePath="/test/file.ts" content="hello world" />
    )
    expect(mockEditor).toHaveBeenCalledWith(
      expect.objectContaining({
        value: 'hello world',
      })
    )
  })

  it('sets readOnly when no onSave provided', () => {
    render(
      <MonacoViewerComponent filePath="/test/file.ts" content="" />
    )
    expect(mockEditor).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          readOnly: true,
        }),
      })
    )
  })

  it('sets readOnly false when onSave is provided', () => {
    const onSave = vi.fn()
    render(
      <MonacoViewerComponent filePath="/test/file.ts" content="" onSave={onSave} />
    )
    expect(mockEditor).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          readOnly: false,
        }),
      })
    )
  })

  it('does not render an inline comment box when no commentsContext', () => {
    const { container } = render(
      <MonacoViewerComponent filePath="/test/file.ts" content="" />
    )
    expect(container.querySelector('textarea[placeholder="Add a comment..."]')).toBeNull()
  })

  it('calls onDirtyChange via onChange handler', () => {
    const onDirtyChange = vi.fn()
    render(
      <MonacoViewerComponent filePath="/test/file.ts" content="original" onDirtyChange={onDirtyChange} />
    )
    // Get the onChange handler passed to the mocked Editor
    const onChangeCall = mockEditor.mock.calls[0][0]
    expect(onChangeCall.onChange).toBeDefined()
    // Simulate editor change with different content
    onChangeCall.onChange('modified')
    expect(onDirtyChange).toHaveBeenCalledWith(true, 'modified')
    // Simulate editor change back to original
    onChangeCall.onChange('original')
    expect(onDirtyChange).toHaveBeenCalledWith(false, 'original')
  })

  it('handles onChange with undefined value', () => {
    const onDirtyChange = vi.fn()
    render(
      <MonacoViewerComponent filePath="/test/file.ts" content="original" onDirtyChange={onDirtyChange} />
    )
    const onChangeCall = mockEditor.mock.calls[0][0]
    onChangeCall.onChange(undefined)
    expect(onDirtyChange).toHaveBeenCalledWith(true, '')
  })

  it('opens the inline comment box in a Monaco view zone when the "+" button is clicked', () => {
    const { container } = render(
      <MonacoViewerComponent
        filePath="/test/file.ts"
        content=""
        commentsContext={{ sessionDirectory: '/test', commentsFilePath: '/test/.broomy/comments.json' }}
      />
    )
    const props = getLastEditorProps()
    const onMount = props.onMount as (editor: unknown, monaco: unknown) => void
    const editor = makeMockEditorInstance()
    // The "+" button is portaled into editor.getDomNode() — attach it to the
    // render tree so React's delegated events (click) fire on it.
    container.appendChild(editor.getDomNode())
    let capturedZone: { afterLineNumber: number; domNode: HTMLDivElement } | undefined
    editor.changeViewZones = vi.fn((cb: (accessor: { addZone: (z: { afterLineNumber: number; domNode: HTMLDivElement }) => string; removeZone: () => void }) => void) => {
      cb({
        addZone: (zone) => { capturedZone = zone; return 'zone-1' },
        removeZone: vi.fn(),
      })
    }) as never
    const monacoInst = makeMockMonaco()

    onMount(editor, monacoInst)

    // Hover line 7 to reveal the "+" affordance over its line number.
    const mouseMoveHandler = editor.onMouseMove.mock.calls[0][0]
    act(() => {
      mouseMoveHandler({ target: { position: { lineNumber: 7 } } })
    })
    const plusButton = container.querySelector<HTMLButtonElement>('button[aria-label="Comment on line 7"]')!
    expect(plusButton).toBeTruthy()

    act(() => {
      fireEvent.click(plusButton)
    })

    expect(editor.changeViewZones).toHaveBeenCalled()
    expect(capturedZone).toBeDefined()
    expect(capturedZone!.afterLineNumber).toBe(7)
    // The InlineCommentBox is portaled into the view-zone's DOM node, quoting
    // the line's content read from the editor model.
    expect(capturedZone!.domNode.textContent).toContain('Line 7')
    expect(capturedZone!.domNode.textContent).toContain('some line content')
    expect(capturedZone!.domNode.querySelector('textarea[placeholder="Add a comment..."]')).toBeTruthy()
  })

  it('shows a "+" comment affordance over the hovered line and clears it on mouse leave', () => {
    const { container } = render(
      <MonacoViewerComponent
        filePath="/test/file.ts"
        content=""
        commentsContext={{ sessionDirectory: '/test', commentsFilePath: '/test/.broomy/comments.json' }}
      />
    )
    const props = getLastEditorProps()
    const onMount = props.onMount as (editor: unknown, monaco: unknown) => void
    const editor = makeMockEditorInstance()
    container.appendChild(editor.getDomNode())
    const monacoInst = makeMockMonaco()

    onMount(editor, monacoInst)

    const mouseMoveHandler = editor.onMouseMove.mock.calls[0][0]
    act(() => {
      mouseMoveHandler({ target: { position: { lineNumber: 3 } } })
    })
    const plusButton = container.querySelector<HTMLElement>('button[aria-label="Comment on line 3"]')!
    expect(plusButton).toBeTruthy()
    // Positioned from getTopForLineNumber/getScrollTop/getOption(lineHeight)/getLayoutInfo().contentLeft.
    expect(plusButton.style.top).toBe('100px')
    expect(plusButton.style.height).toBe('18px')
    expect(plusButton.style.width).toBe('64px')

    // Hovering off any line (no position) hides it.
    act(() => {
      mouseMoveHandler({ target: { position: null } })
    })
    expect(container.querySelector('button[aria-label^="Comment on line"]')).toBeNull()

    // Re-show it, then hide via mouse leave.
    act(() => {
      mouseMoveHandler({ target: { position: { lineNumber: 3 } } })
    })
    expect(container.querySelector('button[aria-label^="Comment on line"]')).toBeTruthy()
    const mouseLeaveHandler = editor.onMouseLeave.mock.calls[0][0]
    act(() => {
      mouseLeaveHandler()
    })
    expect(container.querySelector('button[aria-label^="Comment on line"]')).toBeNull()
  })

  // Opens the comment box for a line and returns the view-zone DOM node the
  // InlineCommentBox is portaled into. The node is attached inside the render
  // container so React's delegated change/click events fire (Monaco attaches it
  // for real).
  function openCommentBox(line: number, mountInto: HTMLElement): HTMLDivElement {
    const onMount = getLastEditorProps().onMount as (editor: unknown, monaco: unknown) => void
    const editor = makeMockEditorInstance()
    mountInto.appendChild(editor.getDomNode())
    let zoneNode: HTMLDivElement | undefined
    editor.changeViewZones = vi.fn((cb: (a: { addZone: (z: { domNode: HTMLDivElement }) => string; removeZone: () => void }) => void) =>
      cb({ addZone: (z) => { zoneNode = z.domNode; mountInto.appendChild(z.domNode); return 'zone-1' }, removeZone: vi.fn() })) as never
    onMount(editor, makeMockMonaco())
    act(() => {
      editor.onMouseMove.mock.calls[0][0]({ target: { position: { lineNumber: line } } })
    })
    const plusButton = mountInto.querySelector<HTMLButtonElement>(`button[aria-label="Comment on line ${line}"]`)!
    act(() => {
      fireEvent.click(plusButton)
    })
    return zoneNode!
  }

  it('closes the comment box without storing anything when Cancel is clicked', () => {
    useCommentsStore.setState({ commentsByDir: { '/test': [] } })
    const { container } = render(
      <MonacoViewerComponent
        filePath="/test/file.ts"
        content=""
        commentsContext={{ sessionDirectory: '/test', commentsFilePath: '/test/.broomy/comments.json' }}
      />
    )
    const zoneNode = openCommentBox(5, container)
    expect(zoneNode.querySelector('textarea')).toBeTruthy()
    act(() => {
      fireEvent.click(zoneNode.querySelector('button[aria-label="Cancel comment"]')!)
    })

    expect(zoneNode.querySelector('textarea')).toBeNull()
    expect(useCommentsStore.getState().commentsByDir['/test']).toEqual([])
  })

  it('calls addCommentAt with the line and typed body when Add is clicked', () => {
    const { container } = render(
      <MonacoViewerComponent
        filePath="/test/file.ts"
        content=""
        commentsContext={{ sessionDirectory: '/test', commentsFilePath: '/test/.broomy/comments.json' }}
      />
    )
    const zoneNode = openCommentBox(5, container)
    const textarea = zoneNode.querySelector('textarea')!
    // Set the controlled textarea value the React-friendly way so onChange runs
    // and the Add button enables.
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(textarea, 'please fix')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => {
      fireEvent.click(zoneNode.querySelector('button[aria-label="Add comment"]')!)
    })

    expect(addCommentAtSpy).toHaveBeenCalledWith(5, 'please fix')
    // The box closes after adding.
    expect(zoneNode.querySelector('textarea')).toBeNull()
  })

  it('provides a Monaco worker for each language label', () => {
    const env = (window as unknown as { MonacoEnvironment: { getWorker: (a: unknown, label: string) => unknown } }).MonacoEnvironment
    for (const label of ['json', 'css', 'html', 'typescript', 'somethingElse']) {
      expect(env.getWorker('', label)).toBeDefined()
    }
  })

  it('re-applies scroll and search highlight and re-baselines content when props change after mount', () => {
    vi.useFakeTimers()
    try {
      const { rerender } = render(
        <MonacoViewerComponent filePath="/test/file.ts" content="a" scrollToLine={5} searchHighlight="x" />
      )
      const onMount = getLastEditorProps().onMount as (editor: unknown, monaco: unknown) => void
      const editor = makeMockEditorInstance()
      onMount(editor, makeMockMonaco())

      // Changing content + scrollToLine + searchHighlight re-runs the content-baseline
      // effect (editor.getValue) and the scroll/highlight effect. "line" is a substring
      // of the mock model's line content, so the highlight branch selects a match.
      rerender(
        <MonacoViewerComponent filePath="/test/file.ts" content="b" scrollToLine={9} searchHighlight="line" />
      )
      act(() => { vi.advanceTimersByTime(300) })

      expect(editor.getValue).toHaveBeenCalled()
      expect(editor.revealLineInCenter).toHaveBeenCalledWith(9)
      expect(editor.setSelection).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('wires up the comment "+" hover affordance (no glyph margin) when commentsContext is provided', () => {
    render(
      <MonacoViewerComponent
        filePath="/test/file.ts"
        content=""
        commentsContext={{ sessionDirectory: '/test', commentsFilePath: '/test/.broomy/comments.json' }}
      />
    )
    // The gutter width is unchanged — no glyphMargin option is set.
    expect(mockEditor).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.not.objectContaining({
          glyphMargin: true,
        }),
      })
    )
    const props = getLastEditorProps()
    const onMount = props.onMount as (editor: unknown, monaco: unknown) => void
    const editor = makeMockEditorInstance()
    const monacoInst = makeMockMonaco()

    onMount(editor, monacoInst)

    expect(editor.getDomNode).toHaveBeenCalled()
    expect(editor.onMouseMove).toHaveBeenCalled()
    expect(editor.onMouseLeave).toHaveBeenCalled()
    expect(editor.onDidScrollChange).toHaveBeenCalled()
  })

  it('renders review comment CSS when commentsContext is provided', () => {
    const { container } = render(
      <MonacoViewerComponent
        filePath="/test/file.ts"
        content=""
        commentsContext={{ sessionDirectory: '/test', commentsFilePath: '/test/.broomy/comments.json' }}
      />
    )
    const style = container.querySelector('style')
    expect(style).toBeTruthy()
    expect(style!.textContent).toContain('review-comment-line')
    expect(style!.textContent).not.toContain('review-comment-glyph')
    expect(style!.textContent).not.toContain('add-comment-glyph')
  })

  it('does not render review comment CSS without commentsContext', () => {
    const { container } = render(
      <MonacoViewerComponent filePath="/test/file.ts" content="" />
    )
    const style = container.querySelector('style')
    expect(style).toBeNull()
  })

  it('calls onDirtyChange(false) when content prop changes', () => {
    const onDirtyChange = vi.fn()
    const { rerender } = render(
      <MonacoViewerComponent filePath="/test/file.ts" content="original" onDirtyChange={onDirtyChange} />
    )
    onDirtyChange.mockClear()
    rerender(
      <MonacoViewerComponent filePath="/test/file.ts" content="updated" onDirtyChange={onDirtyChange} />
    )
    expect(onDirtyChange).toHaveBeenCalledWith(false, 'updated')
  })

  it('does not flag dirty when Monaco fires onChange after a parent-driven content change (regression)', () => {
    // Real-world scenario: file reloads from disk -> parent passes new content prop ->
    // @monaco-editor/react's setValue effect fires onDidChangeModelContent ->
    // our onChange handler runs with the NEW content. If originalContentRef hasn't
    // been synced by then, we'd report dirty=true and poison the per-session
    // dirtyMap, producing a spurious "discard unsaved changes" prompt on next nav.
    const onDirtyChange = vi.fn()
    const { rerender } = render(
      <MonacoViewerComponent filePath="/test/file.ts" content="original" onDirtyChange={onDirtyChange} />
    )

    rerender(
      <MonacoViewerComponent filePath="/test/file.ts" content="reloaded from disk" onDirtyChange={onDirtyChange} />
    )

    // Simulate Monaco's setValue effect firing onChange with the new value.
    const onChangeCall = mockEditor.mock.calls[mockEditor.mock.calls.length - 1][0]
    onDirtyChange.mockClear()
    onChangeCall.onChange('reloaded from disk')

    // Must NOT report dirty=true at any point.
    expect(onDirtyChange).not.toHaveBeenCalledWith(true, expect.anything())
    expect(onDirtyChange).toHaveBeenCalledWith(false, 'reloaded from disk')
  })

  it('still flags dirty when user actually edits after a content reload', () => {
    // Counterpart to the regression test above: real edits must still mark dirty.
    const onDirtyChange = vi.fn()
    const { rerender } = render(
      <MonacoViewerComponent filePath="/test/file.ts" content="original" onDirtyChange={onDirtyChange} />
    )

    rerender(
      <MonacoViewerComponent filePath="/test/file.ts" content="reloaded" onDirtyChange={onDirtyChange} />
    )

    const onChangeCall = mockEditor.mock.calls[mockEditor.mock.calls.length - 1][0]
    onDirtyChange.mockClear()

    // User types something genuinely different.
    onChangeCall.onChange('reloaded + my edit')

    expect(onDirtyChange).toHaveBeenCalledWith(true, 'reloaded + my edit')
  })

  it('does not flag dirty when Monaco normalizes the content (BOM, line endings, etc.)', () => {
    // Monaco strips BOMs and may normalize line endings, so editor.getValue()
    // can differ from the file's raw bytes. The dirty baseline must come from
    // the editor's actual value, not the prop, otherwise files with these
    // characteristics show as dirty consistently before the user types anything.
    const onDirtyChange = vi.fn()
    render(
      <MonacoViewerComponent
        filePath="/test/file.json"
        content={'﻿{"key": "value"}\r\n'}
        onSave={vi.fn()}
        onDirtyChange={onDirtyChange}
      />
    )

    // After mount, simulate Monaco's actual stored value (BOM stripped, CRLF→LF).
    const props = mockEditor.mock.calls[mockEditor.mock.calls.length - 1][0] as Record<string, unknown>
    const onMount = props.onMount as (editor: unknown, monaco: unknown) => void
    const normalizedValue = '{"key": "value"}\n'
    const editor = {
      addCommand: vi.fn(),
      focus: vi.fn(),
      trigger: vi.fn(),
      getValue: vi.fn().mockReturnValue(normalizedValue),
      revealLineInCenter: vi.fn(),
      getModel: vi.fn().mockReturnValue({ getLineContent: vi.fn() }),
      setSelection: vi.fn(),
      createDecorationsCollection: vi.fn(),
    }
    onMount(editor, { KeyMod: { CtrlCmd: 2048 }, KeyCode: { KeyS: 49 }, editor: { EditorOption: { lineHeight: 66 } } })

    // Monaco's onChange fires with its normalized value (e.g. via the wrapper
    // syncing the model on mount, or any code path that re-emits the value).
    onDirtyChange.mockClear()
    const onChangeCall = props.onChange as (value: string) => void
    onChangeCall(normalizedValue)

    expect(onDirtyChange).not.toHaveBeenCalledWith(true, expect.anything())
  })

  it('passes filePath as path to Monaco', () => {
    render(
      <MonacoViewerComponent filePath="/test/file.ts" content="" />
    )
    expect(mockEditor).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/test/file.ts',
      })
    )
  })
})

describe('MonacoViewerComponent onMount lifecycle', () => {
  it('calls onMount and registers Cmd+S handler', () => {
    const onSave = vi.fn().mockResolvedValue(true)
    render(
      <MonacoViewerComponent filePath="/test/file.ts" content="original" onSave={onSave} />
    )
    const props = getLastEditorProps()
    const onMount = props.onMount as (editor: unknown, monaco: unknown) => void
    const editor = makeMockEditorInstance()
    const monacoInst = makeMockMonaco()

    onMount(editor, monacoInst)

    expect(editor.addCommand).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Function),
    )
  })

  it('Cmd+S save handler calls onSave with editor content', async () => {
    const onSave = vi.fn().mockResolvedValue(true)
    const onDirtyChange = vi.fn()
    render(
      <MonacoViewerComponent filePath="/test/file.ts" content="original" onSave={onSave} onDirtyChange={onDirtyChange} />
    )
    const props = getLastEditorProps()
    const onMount = props.onMount as (editor: unknown, monaco: unknown) => void
    const editor = makeMockEditorInstance()
    // At mount, the editor's value matches the initial content (the dirty
    // baseline is anchored to getValue() here).
    editor.getValue.mockReturnValue('original')
    const monacoInst = makeMockMonaco()

    onMount(editor, monacoInst)

    // Now the user types — editor reports the new value.
    editor.getValue.mockReturnValue('modified')

    // Get the save callback (second arg to addCommand)
    const saveCallback = editor.addCommand.mock.calls[0][1] as () => void
    saveCallback()

    await vi.waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('modified')
    })
  })

  it('does not call onSave when content is unchanged', () => {
    const onSave = vi.fn()
    render(
      <MonacoViewerComponent filePath="/test/file.ts" content="original" onSave={onSave} />
    )
    const props = getLastEditorProps()
    const onMount = props.onMount as (editor: unknown, monaco: unknown) => void
    const editor = makeMockEditorInstance()
    editor.getValue.mockReturnValue('original')
    const monacoInst = makeMockMonaco()

    onMount(editor, monacoInst)
    // Editor's value never diverges from the mount baseline — Cmd+S is a no-op.

    const saveCallback = editor.addCommand.mock.calls[0][1] as () => void
    saveCallback()

    expect(onSave).not.toHaveBeenCalled()
  })

  it('Cmd+S handler uses latest onSave after re-render (no stale closure)', async () => {
    const onSave1 = vi.fn().mockResolvedValue(true)
    const onSave2 = vi.fn().mockResolvedValue(true)
    const { rerender } = render(
      <MonacoViewerComponent filePath="/test/file.ts" content="original" onSave={onSave1} />
    )
    const props = getLastEditorProps()
    const onMount = props.onMount as (editor: unknown, monaco: unknown) => void
    const editor = makeMockEditorInstance()
    editor.getValue.mockReturnValue('modified')
    const monacoInst = makeMockMonaco()
    onMount(editor, monacoInst)

    // Parent re-renders with a new onSave (e.g., handleSave's identity changed
    // because filePath or checkForExternalChanges changed)
    rerender(
      <MonacoViewerComponent filePath="/test/file.ts" content="original" onSave={onSave2} />
    )

    const saveCallback = editor.addCommand.mock.calls[0][1] as () => void
    saveCallback()

    await vi.waitFor(() => {
      expect(onSave2).toHaveBeenCalledWith('modified')
    })
    expect(onSave1).not.toHaveBeenCalled()
  })

  it('Cmd+S handler is a no-op when onSave becomes undefined (e.g., diff-ref view)', () => {
    const onSave = vi.fn().mockResolvedValue(true)
    const { rerender } = render(
      <MonacoViewerComponent filePath="/test/file.ts" content="original" onSave={onSave} />
    )
    const props = getLastEditorProps()
    const onMount = props.onMount as (editor: unknown, monaco: unknown) => void
    const editor = makeMockEditorInstance()
    editor.getValue.mockReturnValue('modified')
    const monacoInst = makeMockMonaco()
    onMount(editor, monacoInst)

    // Switch to a view where saving is disallowed (diffCurrentRef sets onSave to undefined)
    rerender(
      <MonacoViewerComponent filePath="/test/file.ts" content="original" />
    )

    const saveCallback = editor.addCommand.mock.calls[0][1] as () => void
    saveCallback()

    expect(onSave).not.toHaveBeenCalled()
  })

  it('Cmd+S handler reports dirty=false on save success via the latest onDirtyChange', async () => {
    const onSave = vi.fn().mockResolvedValue(true)
    const onDirtyChange1 = vi.fn()
    const onDirtyChange2 = vi.fn()
    const { rerender } = render(
      <MonacoViewerComponent filePath="/test/file.ts" content="original" onSave={onSave} onDirtyChange={onDirtyChange1} />
    )
    const props = getLastEditorProps()
    const onMount = props.onMount as (editor: unknown, monaco: unknown) => void
    const editor = makeMockEditorInstance()
    editor.getValue.mockReturnValue('modified')
    const monacoInst = makeMockMonaco()
    onMount(editor, monacoInst)

    rerender(
      <MonacoViewerComponent filePath="/test/file.ts" content="original" onSave={onSave} onDirtyChange={onDirtyChange2} />
    )

    const saveCallback = editor.addCommand.mock.calls[0][1] as () => void
    saveCallback()

    await vi.waitFor(() => {
      expect(onDirtyChange2).toHaveBeenCalledWith(false, 'modified')
    })
  })

  it('opens the comment box via the "+" button after hovering a line, when commentsContext is provided', () => {
    const { container } = render(
      <MonacoViewerComponent
        filePath="/test/file.ts"
        content=""
        commentsContext={{ sessionDirectory: '/test', commentsFilePath: '/test/.broomy/comments.json' }}
      />
    )
    const props = getLastEditorProps()
    const onMount = props.onMount as (editor: unknown, monaco: unknown) => void
    const editor = makeMockEditorInstance()
    container.appendChild(editor.getDomNode())
    const monacoInst = makeMockMonaco()

    onMount(editor, monacoInst)

    act(() => {
      editor.onMouseMove.mock.calls[0][0]({ target: { position: { lineNumber: 4 } } })
    })
    const plusButton = container.querySelector<HTMLButtonElement>('button[aria-label="Comment on line 4"]')!
    expect(plusButton).toBeTruthy()

    act(() => {
      fireEvent.click(plusButton)
    })

    // Clicking hides the "+" affordance and opens the box (a view zone is added).
    expect(container.querySelector('button[aria-label^="Comment on line"]')).toBeNull()
    expect(editor.changeViewZones).toHaveBeenCalled()
  })

  it('does not wire up the comment "+" affordance without commentsContext', () => {
    render(
      <MonacoViewerComponent filePath="/test/file.ts" content="" />
    )
    const props = getLastEditorProps()
    const onMount = props.onMount as (editor: unknown, monaco: unknown) => void
    const editor = makeMockEditorInstance()
    const monacoInst = makeMockMonaco()

    onMount(editor, monacoInst)

    expect(editor.getDomNode).not.toHaveBeenCalled()
    expect(editor.onMouseMove).not.toHaveBeenCalled()
    expect(editor.onMouseLeave).not.toHaveBeenCalled()
    expect(editor.onDidScrollChange).not.toHaveBeenCalled()
  })

  it('calls onEditorReady with showOutline and showFind actions', () => {
    const onEditorReady = vi.fn()
    render(
      <MonacoViewerComponent filePath="/test/file.ts" content="" onEditorReady={onEditorReady} />
    )
    const props = getLastEditorProps()
    const onMount = props.onMount as (editor: unknown, monaco: unknown) => void
    const editor = makeMockEditorInstance()
    const monacoInst = makeMockMonaco()

    onMount(editor, monacoInst)

    expect(onEditorReady).toHaveBeenCalledWith(
      expect.objectContaining({ showOutline: expect.any(Function), showFind: expect.any(Function) }),
    )

    // Test the showOutline action
    const actions = onEditorReady.mock.calls[0][0]
    actions.showOutline()
    expect(editor.focus).toHaveBeenCalled()
    expect(editor.trigger).toHaveBeenCalledWith('keyboard', 'editor.action.quickOutline', {})

    // Test the showFind action
    editor.focus.mockClear()
    editor.trigger.mockClear()
    actions.showFind()
    expect(editor.focus).toHaveBeenCalled()
    expect(editor.trigger).toHaveBeenCalledWith('keyboard', 'actions.find', {})
  })

  it('scrolls to line on mount when scrollToLine is set', () => {
    vi.useFakeTimers()
    render(
      <MonacoViewerComponent filePath="/test/file.ts" content="content" scrollToLine={15} />
    )
    const props = getLastEditorProps()
    const onMount = props.onMount as (editor: unknown, monaco: unknown) => void
    const editor = makeMockEditorInstance()
    const monacoInst = makeMockMonaco()

    onMount(editor, monacoInst)
    vi.advanceTimersByTime(200)

    expect(editor.revealLineInCenter).toHaveBeenCalledWith(15)
    vi.useRealTimers()
  })

  it('highlights search text when scrollToLine and searchHighlight are set', () => {
    vi.useFakeTimers()
    render(
      <MonacoViewerComponent filePath="/test/file.ts" content="content" scrollToLine={5} searchHighlight="some" />
    )
    const props = getLastEditorProps()
    const onMount = props.onMount as (editor: unknown, monaco: unknown) => void
    const editor = makeMockEditorInstance()
    editor.getModel.mockReturnValue({
      getLineContent: vi.fn().mockReturnValue('some line content'),
    })
    const monacoInst = makeMockMonaco()

    onMount(editor, monacoInst)
    vi.advanceTimersByTime(200)

    expect(editor.revealLineInCenter).toHaveBeenCalledWith(5)
    expect(editor.setSelection).toHaveBeenCalled()
    expect(editor.createDecorationsCollection).toHaveBeenCalled()
    vi.useRealTimers()
  })
})

describe('MonacoViewerComponent editor opener', () => {
  it('registers an editor opener for cross-file navigation', () => {
    render(
      <MonacoViewerComponent filePath="/test/file.ts" content="" />
    )
    expect(mockRegisterEditorOpener).toHaveBeenCalled()
  })

  // Helper: flush queueMicrotask used by the deferred opener callback
  const flushMicrotasks = () => new Promise<void>(resolve => queueMicrotask(resolve))

  it('editor opener calls onOpenFile with path and line (deferred)', async () => {
    const onOpenFile = vi.fn()
    render(
      <MonacoViewerComponent filePath="/test/file.ts" content="" onOpenFile={onOpenFile} />
    )
    // Get the opener callback
    const openerArg = mockRegisterEditorOpener.mock.calls[0][0]
    const result = openerArg.openCodeEditor(
      null,
      { path: '/test/other.ts' },
      { startLineNumber: 42 },
    )
    expect(result).toBe(true)
    // onOpenFile is deferred via queueMicrotask so Monaco can finish its event pipeline
    expect(onOpenFile).not.toHaveBeenCalled()
    await flushMicrotasks()
    expect(onOpenFile).toHaveBeenCalledWith('/test/other.ts', 42)
  })

  it('editor opener handles position with lineNumber', async () => {
    const onOpenFile = vi.fn()
    render(
      <MonacoViewerComponent filePath="/test/file.ts" content="" onOpenFile={onOpenFile} />
    )
    const openerArg = mockRegisterEditorOpener.mock.calls[0][0]
    const result = openerArg.openCodeEditor(
      null,
      { path: '/test/other.ts' },
      { lineNumber: 10 },
    )
    expect(result).toBe(true)
    await flushMicrotasks()
    expect(onOpenFile).toHaveBeenCalledWith('/test/other.ts', 10)
  })

  it('editor opener returns false when no onOpenFile', () => {
    render(
      <MonacoViewerComponent filePath="/test/file.ts" content="" />
    )
    const openerArg = mockRegisterEditorOpener.mock.calls[0][0]
    const result = openerArg.openCodeEditor(
      null,
      { path: '/test/other.ts' },
      null,
    )
    expect(result).toBe(false)
  })

  it('editor opener handles no selectionOrPosition', async () => {
    const onOpenFile = vi.fn()
    render(
      <MonacoViewerComponent filePath="/test/file.ts" content="" onOpenFile={onOpenFile} />
    )
    const openerArg = mockRegisterEditorOpener.mock.calls[0][0]
    openerArg.openCodeEditor(null, { path: '/test/other.ts' }, undefined)
    await flushMicrotasks()
    expect(onOpenFile).toHaveBeenCalledWith('/test/other.ts', undefined)
  })

  it('editor opener returns false when resource has no path', () => {
    const onOpenFile = vi.fn()
    render(
      <MonacoViewerComponent filePath="/test/file.ts" content="" onOpenFile={onOpenFile} />
    )
    const openerArg = mockRegisterEditorOpener.mock.calls[0][0]
    const result = openerArg.openCodeEditor(null, { path: '' }, { lineNumber: 1 })
    expect(result).toBe(false)
    // No microtask queued — callback never fires
    expect(onOpenFile).not.toHaveBeenCalled()
  })

  it('editor opener uses latest onOpenFile after re-render', async () => {
    const onOpenFile1 = vi.fn()
    const onOpenFile2 = vi.fn()
    const { rerender } = render(
      <MonacoViewerComponent filePath="/test/file.ts" content="" onOpenFile={onOpenFile1} />
    )
    // Re-render with a different onOpenFile (simulates active session change)
    rerender(
      <MonacoViewerComponent filePath="/test/file.ts" content="" onOpenFile={onOpenFile2} />
    )

    const openerArg = mockRegisterEditorOpener.mock.calls[0][0]
    openerArg.openCodeEditor(null, { path: '/test/other.ts' }, { lineNumber: 5 })
    await flushMicrotasks()

    // Should use the LATEST callback, not the one from initial render
    expect(onOpenFile1).not.toHaveBeenCalled()
    expect(onOpenFile2).toHaveBeenCalledWith('/test/other.ts', 5)
  })

  it('editor opener handles onOpenFile becoming undefined (session deactivated)', () => {
    const onOpenFile = vi.fn()
    const { rerender } = render(
      <MonacoViewerComponent filePath="/test/file.ts" content="" onOpenFile={onOpenFile} />
    )
    // Session becomes inactive — onOpenFile is now undefined
    rerender(
      <MonacoViewerComponent filePath="/test/file.ts" content="" />
    )

    const openerArg = mockRegisterEditorOpener.mock.calls[0][0]
    const result = openerArg.openCodeEditor(null, { path: '/test/other.ts' }, { lineNumber: 1 })

    // No callback → returns false, no microtask queued
    expect(result).toBe(false)
    expect(onOpenFile).not.toHaveBeenCalled()
  })

  it('editor opener handles onOpenFile becoming defined (session activated)', async () => {
    const { rerender } = render(
      <MonacoViewerComponent filePath="/test/file.ts" content="" />
    )
    const onOpenFile = vi.fn()
    // Session becomes active — onOpenFile is now defined
    rerender(
      <MonacoViewerComponent filePath="/test/file.ts" content="" onOpenFile={onOpenFile} />
    )

    const openerArg = mockRegisterEditorOpener.mock.calls[0][0]
    const result = openerArg.openCodeEditor(null, { path: '/test/other.ts' }, { startLineNumber: 10 })

    expect(result).toBe(true)
    await flushMicrotasks()
    expect(onOpenFile).toHaveBeenCalledWith('/test/other.ts', 10)
  })

  it('disposes editor opener on unmount', () => {
    const disposeFn = vi.fn()
    mockRegisterEditorOpener.mockReturnValue({ dispose: disposeFn })

    const { unmount } = render(
      <MonacoViewerComponent filePath="/test/file.ts" content="" />
    )
    unmount()
    expect(disposeFn).toHaveBeenCalled()
  })

  it('calls onEditorReady(null) on unmount', () => {
    const onEditorReady = vi.fn()
    const { unmount } = render(
      <MonacoViewerComponent filePath="/test/file.ts" content="" onEditorReady={onEditorReady} />
    )
    unmount()
    expect(onEditorReady).toHaveBeenCalledWith(null)
  })
})

describe('getLanguageFromPath (via MonacoViewer)', () => {
  it('maps common extensions correctly', () => {
    const cases: [string, string][] = [
      ['/file.ts', 'typescript'],
      ['/file.tsx', 'typescript'],
      ['/file.js', 'javascript'],
      ['/file.jsx', 'javascript'],
      ['/file.json', 'json'],
      ['/file.md', 'markdown'],
      ['/file.css', 'css'],
      ['/file.scss', 'scss'],
      ['/file.html', 'html'],
      ['/file.py', 'python'],
      ['/file.rb', 'ruby'],
      ['/file.go', 'go'],
      ['/file.rs', 'rust'],
      ['/file.java', 'java'],
      ['/file.sh', 'shell'],
      ['/file.sql', 'sql'],
      ['/file.yaml', 'yaml'],
      ['/file.yml', 'yaml'],
      ['/file.xml', 'xml'],
      ['/file.svg', 'xml'],
      ['/file.c', 'c'],
      ['/file.cpp', 'cpp'],
      ['/file.cs', 'csharp'],
      ['/file.php', 'php'],
      ['/file.lua', 'lua'],
      ['/file.swift', 'swift'],
      ['/file.dart', 'dart'],
      ['/file.toml', 'ini'],
      ['/file.ini', 'ini'],
      ['/file.bat', 'bat'],
      ['/file.ps1', 'powershell'],
      ['/file.graphql', 'graphql'],
      ['/file.txt', 'plaintext'],
      ['/file.log', 'plaintext'],
      ['/file.unknown', 'plaintext'],
    ]
    for (const [filePath, expectedLanguage] of cases) {
      mockEditor.mockClear()
      cleanup()
      render(<MonacoViewerComponent filePath={filePath} content="" />)
      expect(mockEditor).toHaveBeenCalledWith(
        expect.objectContaining({ language: expectedLanguage }),
      )
    }
  })
})
