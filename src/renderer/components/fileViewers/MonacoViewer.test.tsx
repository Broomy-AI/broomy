// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '../../../test/react-setup'

// Mock Monaco editor and workers to avoid loading real Monaco
const mockEditor = vi.fn().mockReturnValue(null)
vi.mock('@monaco-editor/react', () => ({
  default: (props: Record<string, unknown>) => {
    mockEditor(props)
    return null
  },
  loader: { config: vi.fn() },
}))

vi.mock('monaco-editor', () => ({
  editor: {
    registerEditorOpener: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  },
  Range: vi.fn(),
}))

vi.mock('monaco-editor/esm/vs/editor/editor.worker?worker', () => ({ default: vi.fn() }))
vi.mock('monaco-editor/esm/vs/language/json/json.worker?worker', () => ({ default: vi.fn() }))
vi.mock('monaco-editor/esm/vs/language/css/css.worker?worker', () => ({ default: vi.fn() }))
vi.mock('monaco-editor/esm/vs/language/html/html.worker?worker', () => ({ default: vi.fn() }))
vi.mock('monaco-editor/esm/vs/language/typescript/ts.worker?worker', () => ({ default: vi.fn() }))

vi.mock('../../hooks/useMonacoComments', () => ({
  useMonacoComments: vi.fn().mockReturnValue({
    commentLine: null,
    setCommentLine: vi.fn(),
    commentText: '',
    setCommentText: vi.fn(),
    existingComments: [],
    handleAddComment: vi.fn(),
  }),
}))

import { MonacoViewer } from './MonacoViewer'

const MonacoViewerComponent = MonacoViewer.component

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

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
        theme: 'vs-dark',
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

  it('does not render comment input when no reviewContext', () => {
    const { container } = render(
      <MonacoViewerComponent filePath="/test/file.ts" content="" />
    )
    expect(container.querySelector('input[placeholder="Type your comment..."]')).toBeNull()
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

  it('renders comment input when reviewContext and commentLine are set', async () => {
    const { useMonacoComments } = await import('../../hooks/useMonacoComments')
    vi.mocked(useMonacoComments).mockReturnValue({
      commentLine: 5,
      setCommentLine: vi.fn(),
      commentText: 'test comment',
      setCommentText: vi.fn(),
      existingComments: [],
      handleAddComment: vi.fn(),
    })

    const { container } = render(
      <MonacoViewerComponent
        filePath="/test/file.ts"
        content=""
        reviewContext={{ sessionDirectory: '/test', commentsFilePath: '/test/.broomy/comments.json' }}
      />
    )
    expect(container.querySelector('input[placeholder="Type your comment..."]')).toBeTruthy()
    expect(screen.getByText('Comment on line 5:')).toBeTruthy()

    // Reset the mock
    vi.mocked(useMonacoComments).mockReturnValue({
      commentLine: null,
      setCommentLine: vi.fn(),
      commentText: '',
      setCommentText: vi.fn(),
      existingComments: [],
      handleAddComment: vi.fn(),
    })
  })

  it('enables glyphMargin when reviewContext is provided', () => {
    render(
      <MonacoViewerComponent
        filePath="/test/file.ts"
        content=""
        reviewContext={{ sessionDirectory: '/test', commentsFilePath: '/test/.broomy/comments.json' }}
      />
    )
    expect(mockEditor).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          glyphMargin: true,
        }),
      })
    )
  })
})
