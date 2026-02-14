// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import { RecentFiles } from './RecentFiles'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RecentFiles', () => {
  it('shows empty state when no recent files', () => {
    render(<RecentFiles recentFiles={[]} />)
    expect(screen.getByText('No recently opened files')).toBeTruthy()
  })

  it('renders file names from paths', () => {
    const recentFiles = ['/repos/project/src/index.ts', '/repos/project/src/app.tsx']
    render(<RecentFiles recentFiles={recentFiles} />)
    expect(screen.getByText('index.ts')).toBeTruthy()
    expect(screen.getByText('app.tsx')).toBeTruthy()
  })

  it('shows relative paths when directory is provided', () => {
    const recentFiles = ['/repos/project/src/index.ts']
    render(<RecentFiles recentFiles={recentFiles} directory="/repos/project" />)
    expect(screen.getByText('src/index.ts')).toBeTruthy()
  })

  it('calls onFileSelect when clicking a file', () => {
    const onFileSelect = vi.fn()
    const recentFiles = ['/repos/project/src/index.ts']
    render(<RecentFiles recentFiles={recentFiles} onFileSelect={onFileSelect} />)
    fireEvent.click(screen.getByText('index.ts'))
    expect(onFileSelect).toHaveBeenCalledWith({
      filePath: '/repos/project/src/index.ts',
      openInDiffMode: false,
    })
  })

  it('calls onFileSelect on Enter keydown', () => {
    const onFileSelect = vi.fn()
    const recentFiles = ['/repos/project/src/index.ts']
    render(<RecentFiles recentFiles={recentFiles} onFileSelect={onFileSelect} />)
    const item = screen.getByText('index.ts').closest('[data-tree-item]')!
    fireEvent.keyDown(item, { key: 'Enter' })
    expect(onFileSelect).toHaveBeenCalledWith({
      filePath: '/repos/project/src/index.ts',
      openInDiffMode: false,
    })
  })

  it('highlights selected file', () => {
    const recentFiles = ['/repos/project/src/index.ts', '/repos/project/src/app.tsx']
    const { container } = render(
      <RecentFiles
        recentFiles={recentFiles}
        selectedFilePath="/repos/project/src/index.ts"
      />
    )
    const items = container.querySelectorAll('[data-tree-item]')
    expect(items[0].className).toContain('bg-accent/20')
    expect(items[1].className).not.toContain('bg-accent/20')
  })

  it('has title attribute with relative path', () => {
    const recentFiles = ['/repos/project/src/index.ts']
    render(<RecentFiles recentFiles={recentFiles} directory="/repos/project" />)
    const item = screen.getByText('index.ts').closest('[data-tree-item]')!
    expect(item.getAttribute('title')).toBe('src/index.ts')
  })
})
