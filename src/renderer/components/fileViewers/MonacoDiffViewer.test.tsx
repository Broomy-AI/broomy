// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import '../../../test/react-setup'

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
  editor: {},
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
        theme: 'vs-dark',
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

    const mockModifiedEditor = {
      revealLineInCenter: vi.fn(),
      setPosition: vi.fn(),
    }
    const mockEditorInstance = {
      getModifiedEditor: vi.fn().mockReturnValue(mockModifiedEditor),
    }
    onMountHandler(mockEditorInstance)

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
    const mockModifiedEditor = {
      revealLineInCenter: vi.fn(),
      setPosition: vi.fn(),
    }
    const mockEditorInstance = {
      getModifiedEditor: vi.fn().mockReturnValue(mockModifiedEditor),
    }
    onMountHandler(mockEditorInstance)

    expect(mockModifiedEditor.revealLineInCenter).not.toHaveBeenCalled()
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
