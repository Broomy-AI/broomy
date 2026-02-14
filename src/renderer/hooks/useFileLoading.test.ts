// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useFileLoading } from './useFileLoading'

// Mock the fileViewers module
vi.mock('../components/fileViewers', () => ({
  getViewersForFile: vi.fn().mockReturnValue([]),
  isTextContent: vi.fn().mockReturnValue(true),
}))

import { getViewersForFile, isTextContent } from '../components/fileViewers'

const monacoViewer = { id: 'monaco', name: 'Code', canHandle: () => true, priority: 0, component: () => null }
const imageViewer = { id: 'image', name: 'Image', canHandle: () => true, priority: 10, component: () => null }
const markdownViewer = { id: 'markdown', name: 'Markdown', canHandle: () => true, priority: 5, component: () => null }

function makeParams(overrides: Partial<Parameters<typeof useFileLoading>[0]> = {}) {
  return {
    filePath: '/project/src/file.ts',
    fileStatus: undefined,
    directory: '/project',
    initialViewMode: undefined,
    scrollToLine: undefined,
    selectedViewerId: null,
    setSelectedViewerId: vi.fn(),
    ...overrides,
  } as Parameters<typeof useFileLoading>[0]
}

describe('useFileLoading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getViewersForFile).mockReturnValue([monacoViewer])
    vi.mocked(isTextContent).mockReturnValue(true)
    vi.mocked(window.fs.readFile).mockResolvedValue('file content')
  })

  // --- Basic loading ---
  it('loads file content and sets available viewers', async () => {
    const params = makeParams()
    const { result } = renderHook(() => useFileLoading(params))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.content).toBe('file content')
    expect(result.current.error).toBeNull()
    expect(result.current.availableViewers).toEqual([monacoViewer])
    expect(params.setSelectedViewerId).toHaveBeenCalledWith('monaco')
  })

  // --- Null filePath ---
  it('resets state when filePath is null', () => {
    const params = makeParams({ filePath: null })
    const { result } = renderHook(() => useFileLoading(params))
    expect(result.current.content).toBe('')
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.availableViewers).toEqual([])
    expect(params.setSelectedViewerId).toHaveBeenCalledWith(null)
  })

  // --- Error handling ---
  it('sets error when readFile fails and no non-text viewer available', async () => {
    vi.mocked(window.fs.readFile).mockRejectedValue(new Error('ENOENT'))
    vi.mocked(getViewersForFile).mockReturnValue([monacoViewer])
    const params = makeParams()
    const { result } = renderHook(() => useFileLoading(params))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.error).toBe('ENOENT')
  })

  it('handles non-Error rejection', async () => {
    vi.mocked(window.fs.readFile).mockRejectedValue('string error')
    vi.mocked(getViewersForFile).mockReturnValue([monacoViewer])
    const params = makeParams()
    const { result } = renderHook(() => useFileLoading(params))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.error).toBe('Failed to read file')
  })

  it('does not set error when readFile fails but image viewer is available', async () => {
    vi.mocked(window.fs.readFile).mockRejectedValue(new Error('binary'))
    vi.mocked(getViewersForFile).mockReturnValue([imageViewer])
    const params = makeParams()
    const { result } = renderHook(() => useFileLoading(params))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.error).toBeNull()
    expect(result.current.availableViewers).toEqual([imageViewer])
  })

  // --- Deleted files ---
  it('loads content from git show for deleted files', async () => {
    vi.mocked(window.fs.readFile).mockRejectedValue(new Error('ENOENT'))
    vi.mocked(window.git.show).mockResolvedValue('old content')
    vi.mocked(getViewersForFile).mockReturnValue([monacoViewer])
    const params = makeParams({ fileStatus: 'deleted', directory: '/project' })
    const { result } = renderHook(() => useFileLoading(params))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.content).toBe('old content')
    expect(result.current.error).toBeNull()
    expect(window.git.show).toHaveBeenCalledWith('/project', 'src/file.ts')
  })

  it('still errors when deleted file git show also fails', async () => {
    vi.mocked(window.fs.readFile).mockRejectedValue(new Error('ENOENT'))
    vi.mocked(window.git.show).mockRejectedValue(new Error('no such ref'))
    vi.mocked(getViewersForFile).mockReturnValue([monacoViewer])
    const params = makeParams({ fileStatus: 'deleted', directory: '/project' })
    const { result } = renderHook(() => useFileLoading(params))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.error).toBe('ENOENT')
  })

  it('does not try git show for deleted file when directory is missing', async () => {
    vi.mocked(window.fs.readFile).mockRejectedValue(new Error('gone'))
    vi.mocked(getViewersForFile).mockReturnValue([monacoViewer])
    const params = makeParams({ fileStatus: 'deleted', directory: undefined })
    const { result } = renderHook(() => useFileLoading(params))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(window.git.show).not.toHaveBeenCalled()
    expect(result.current.error).toBe('gone')
  })

  // --- Viewer selection ---
  it('selects monaco viewer when initialViewMode is diff', async () => {
    vi.mocked(getViewersForFile).mockReturnValue([markdownViewer, monacoViewer])
    vi.mocked(isTextContent).mockReturnValue(true)
    const params = makeParams({ initialViewMode: 'diff' as never, selectedViewerId: null })
    const { result } = renderHook(() => useFileLoading(params))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(params.setSelectedViewerId).toHaveBeenCalledWith('monaco')
  })

  it('selects monaco viewer when scrollToLine is set', async () => {
    vi.mocked(getViewersForFile).mockReturnValue([markdownViewer, monacoViewer])
    vi.mocked(isTextContent).mockReturnValue(true)
    const params = makeParams({ scrollToLine: 42, selectedViewerId: null })
    const { result } = renderHook(() => useFileLoading(params))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(params.setSelectedViewerId).toHaveBeenCalledWith('monaco')
  })

  it('selects first viewer when no special conditions and no current selection', async () => {
    vi.mocked(getViewersForFile).mockReturnValue([markdownViewer, monacoViewer])
    vi.mocked(isTextContent).mockReturnValue(true)
    const params = makeParams({ selectedViewerId: null })
    const { result } = renderHook(() => useFileLoading(params))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(params.setSelectedViewerId).toHaveBeenCalledWith('markdown')
  })

  it('keeps current viewer if it is still available', async () => {
    vi.mocked(getViewersForFile).mockReturnValue([markdownViewer, monacoViewer])
    vi.mocked(isTextContent).mockReturnValue(true)
    const params = makeParams({ selectedViewerId: 'monaco' })
    const { result } = renderHook(() => useFileLoading(params))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    // setSelectedViewerId should NOT have been called because current is still available
    expect(params.setSelectedViewerId).not.toHaveBeenCalled()
  })

  it('sets selectedViewerId to null when no viewers available', async () => {
    vi.mocked(getViewersForFile).mockReturnValue([])
    const params = makeParams({ selectedViewerId: null })
    const { result } = renderHook(() => useFileLoading(params))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(params.setSelectedViewerId).toHaveBeenCalledWith(null)
  })

  // --- Content-based viewer filtering ---
  it('filters out monaco viewer when content is not text', async () => {
    vi.mocked(getViewersForFile).mockReturnValue([imageViewer, monacoViewer])
    vi.mocked(isTextContent).mockReturnValue(false)
    const params = makeParams({ selectedViewerId: null })
    const { result } = renderHook(() => useFileLoading(params))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    // Only image viewer should remain (monaco filtered out because content is not text)
    expect(result.current.availableViewers).toEqual([imageViewer])
  })

  it('filters out non-image/non-monaco viewers when content is empty', async () => {
    vi.mocked(window.fs.readFile).mockResolvedValue('')
    // A custom viewer that requires content
    const customViewer = { id: 'custom', name: 'Custom', canHandle: () => true, priority: 5, component: () => null }
    vi.mocked(getViewersForFile).mockReturnValue([customViewer, monacoViewer])
    vi.mocked(isTextContent).mockReturnValue(true)
    const params = makeParams({ selectedViewerId: null })
    const { result } = renderHook(() => useFileLoading(params))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    // customViewer filtered out (!!'' is false), monaco stays (text content check)
    expect(result.current.availableViewers).toEqual([monacoViewer])
  })

  // --- Fallback to first viewer when monaco not found in diff mode ---
  it('falls back to first viewer when diff mode but no monaco viewer', async () => {
    vi.mocked(getViewersForFile).mockReturnValue([markdownViewer])
    vi.mocked(isTextContent).mockReturnValue(true)
    const params = makeParams({ initialViewMode: 'diff' as never, selectedViewerId: null })
    const { result } = renderHook(() => useFileLoading(params))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(params.setSelectedViewerId).toHaveBeenCalledWith('markdown')
  })

  // --- Cancellation ---
  it('cancels in-flight load when filePath changes', async () => {
    let resolveFirst!: (v: string) => void
    vi.mocked(window.fs.readFile)
      .mockImplementationOnce(() => new Promise(r => { resolveFirst = r }))
      .mockResolvedValueOnce('second file')
    vi.mocked(getViewersForFile).mockReturnValue([monacoViewer])

    const params = makeParams({ filePath: '/project/a.ts' })
    const { result, rerender } = renderHook(
      (props: Parameters<typeof useFileLoading>[0]) => useFileLoading(props),
      { initialProps: params }
    )

    // Change filePath before first resolves
    rerender(makeParams({ filePath: '/project/b.ts' }))
    resolveFirst('first file')

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.content).toBe('second file')
  })

  // --- Path conversion for deleted files ---
  it('handles file path that does not start with directory for deleted files', async () => {
    vi.mocked(window.fs.readFile).mockRejectedValue(new Error('gone'))
    vi.mocked(window.git.show).mockResolvedValue('old')
    vi.mocked(getViewersForFile).mockReturnValue([monacoViewer])
    const params = makeParams({
      filePath: '/other/file.ts',
      directory: '/project',
      fileStatus: 'deleted',
    })
    const { result } = renderHook(() => useFileLoading(params))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(window.git.show).toHaveBeenCalledWith('/project', '/other/file.ts')
  })
})
