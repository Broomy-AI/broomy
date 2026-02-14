// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import '../../../test/react-setup'
import { SearchPanel } from './SearchPanel'

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

describe('SearchPanel', () => {
  it('renders search input', () => {
    render(<SearchPanel directory="/repos/project" />)
    expect(screen.getByPlaceholderText('Search files...')).toBeTruthy()
  })

  it('shows hint for short queries', () => {
    render(<SearchPanel directory="/repos/project" />)
    fireEvent.change(screen.getByPlaceholderText('Search files...'), { target: { value: 'a' } })
    expect(screen.getByText('Type at least 2 characters')).toBeTruthy()
  })

  it('shows Searching... while searching', async () => {
    vi.mocked(window.fs.search).mockImplementation(
      () => new Promise(() => {}) // never resolves
    )

    render(<SearchPanel directory="/repos/project" />)
    fireEvent.change(screen.getByPlaceholderText('Search files...'), { target: { value: 'test' } })

    // Advance past the debounce timeout but search hasn't resolved
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(screen.getByText('Searching...')).toBeTruthy()
  })

  it('shows No results found when search returns empty', async () => {
    vi.mocked(window.fs.search).mockResolvedValue([])

    render(<SearchPanel directory="/repos/project" />)
    fireEvent.change(screen.getByPlaceholderText('Search files...'), { target: { value: 'test' } })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    // Allow the promise to resolve
    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByText('No results found')).toBeTruthy()
  })

  it('renders search results with file names', async () => {
    vi.mocked(window.fs.search).mockResolvedValue([
      {
        name: 'index.ts',
        path: '/repos/project/src/index.ts',
        relativePath: 'src/index.ts',
        matchType: 'content',
        contentMatches: [{ line: 5, text: 'const test = true' }],
      },
    ])

    render(<SearchPanel directory="/repos/project" />)
    fireEvent.change(screen.getByPlaceholderText('Search files...'), { target: { value: 'test' } })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByText('index.ts')).toBeTruthy()
    expect(screen.getByText('content')).toBeTruthy()
  })

  it('renders content match lines', async () => {
    vi.mocked(window.fs.search).mockResolvedValue([
      {
        name: 'index.ts',
        path: '/repos/project/src/index.ts',
        relativePath: 'src/index.ts',
        matchType: 'content',
        contentMatches: [{ line: 5, text: 'const test = true' }],
      },
    ])

    render(<SearchPanel directory="/repos/project" />)
    fireEvent.change(screen.getByPlaceholderText('Search files...'), { target: { value: 'test' } })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByText('5:')).toBeTruthy()
    expect(screen.getByText('const test = true')).toBeTruthy()
  })

  it('calls onFileSelect when clicking a result', async () => {
    const onFileSelect = vi.fn()
    vi.mocked(window.fs.search).mockResolvedValue([
      {
        name: 'index.ts',
        path: '/repos/project/src/index.ts',
        relativePath: 'src/index.ts',
        matchType: 'filename',
        contentMatches: [],
      },
    ])

    render(<SearchPanel directory="/repos/project" onFileSelect={onFileSelect} />)
    fireEvent.change(screen.getByPlaceholderText('Search files...'), { target: { value: 'index' } })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    await act(async () => {
      await Promise.resolve()
    })

    fireEvent.click(screen.getByText('index.ts'))
    expect(onFileSelect).toHaveBeenCalledWith({
      filePath: '/repos/project/src/index.ts',
      openInDiffMode: false,
    })
  })

  it('clears results when query is too short', async () => {
    vi.mocked(window.fs.search).mockResolvedValue([
      {
        name: 'index.ts',
        path: '/repos/project/src/index.ts',
        relativePath: 'src/index.ts',
        matchType: 'filename',
        contentMatches: [],
      },
    ])

    render(<SearchPanel directory="/repos/project" />)

    // First search
    fireEvent.change(screen.getByPlaceholderText('Search files...'), { target: { value: 'test' } })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    await act(async () => {
      await Promise.resolve()
    })

    // Clear to short query
    fireEvent.change(screen.getByPlaceholderText('Search files...'), { target: { value: 'a' } })
    expect(screen.getByText('Type at least 2 characters')).toBeTruthy()
  })
})
