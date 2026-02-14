// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import { FileTreeIcon, SourceControlIcon, SearchIcon, RecentIcon, StatusBadge, BranchStatusCard } from './icons'

afterEach(() => {
  cleanup()
})

describe('FileTreeIcon', () => {
  it('renders an SVG element', () => {
    const { container } = render(<FileTreeIcon />)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('applies className prop', () => {
    const { container } = render(<FileTreeIcon className="test-class" />)
    expect(container.querySelector('svg')?.classList.contains('test-class')).toBe(true)
  })
})

describe('SourceControlIcon', () => {
  it('renders an SVG element', () => {
    const { container } = render(<SourceControlIcon />)
    expect(container.querySelector('svg')).toBeTruthy()
  })
})

describe('SearchIcon', () => {
  it('renders an SVG element', () => {
    const { container } = render(<SearchIcon />)
    expect(container.querySelector('svg')).toBeTruthy()
  })
})

describe('RecentIcon', () => {
  it('renders an SVG element', () => {
    const { container } = render(<RecentIcon />)
    expect(container.querySelector('svg')).toBeTruthy()
  })
})

describe('StatusBadge', () => {
  it('renders the first letter of the status', () => {
    render(<StatusBadge status="modified" />)
    expect(screen.getByText('M')).toBeTruthy()
  })

  it('renders A for added status', () => {
    render(<StatusBadge status="added" />)
    expect(screen.getByText('A')).toBeTruthy()
  })

  it('renders D for deleted status', () => {
    render(<StatusBadge status="deleted" />)
    expect(screen.getByText('D')).toBeTruthy()
  })

  it('has title attribute with label', () => {
    render(<StatusBadge status="modified" />)
    expect(screen.getByText('M').getAttribute('title')).toBe('Modified')
  })
})

describe('BranchStatusCard', () => {
  it('renders PUSHED status', () => {
    render(<BranchStatusCard status="pushed" />)
    expect(screen.getByText('PUSHED')).toBeTruthy()
    expect(screen.getByText('Changes pushed to remote.')).toBeTruthy()
  })

  it('renders EMPTY status', () => {
    render(<BranchStatusCard status="empty" />)
    expect(screen.getByText('EMPTY')).toBeTruthy()
    expect(screen.getByText('No changes on this branch.')).toBeTruthy()
  })

  it('renders PR OPEN status', () => {
    render(<BranchStatusCard status="open" />)
    expect(screen.getByText('PR OPEN')).toBeTruthy()
    expect(screen.getByText('Pull request is open.')).toBeTruthy()
  })

  it('renders MERGED status', () => {
    render(<BranchStatusCard status="merged" />)
    expect(screen.getByText('MERGED')).toBeTruthy()
    expect(screen.getByText('Merged into main.')).toBeTruthy()
  })

  it('renders CLOSED status', () => {
    render(<BranchStatusCard status="closed" />)
    expect(screen.getByText('CLOSED')).toBeTruthy()
    expect(screen.getByText('PR was closed.')).toBeTruthy()
  })

  it('returns null for unknown status', () => {
    const { container } = render(<BranchStatusCard status={'in-progress' as never} />)
    expect(container.innerHTML).toBe('')
  })
})
