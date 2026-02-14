// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import { LocationLink, SeverityBadge, ChangeStatusBadge } from './ReviewHelpers'

afterEach(() => {
  cleanup()
})

describe('LocationLink', () => {
  it('renders file and line number', () => {
    render(
      <LocationLink
        location={{ file: 'src/app.ts', startLine: 42 }}
        directory="/test"
        onClick={vi.fn()}
      />
    )
    expect(screen.getByText('src/app.ts:42')).toBeTruthy()
  })

  it('renders line range when endLine differs from startLine', () => {
    render(
      <LocationLink
        location={{ file: 'src/app.ts', startLine: 10, endLine: 25 }}
        directory="/test"
        onClick={vi.fn()}
      />
    )
    expect(screen.getByText('src/app.ts:10-25')).toBeTruthy()
  })

  it('does not show endLine when same as startLine', () => {
    render(
      <LocationLink
        location={{ file: 'src/app.ts', startLine: 10, endLine: 10 }}
        directory="/test"
        onClick={vi.fn()}
      />
    )
    expect(screen.getByText('src/app.ts:10')).toBeTruthy()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(
      <LocationLink
        location={{ file: 'src/app.ts', startLine: 42 }}
        directory="/test"
        onClick={onClick}
      />
    )
    fireEvent.click(screen.getByText('src/app.ts:42'))
    expect(onClick).toHaveBeenCalled()
  })

  it('has correct title attribute', () => {
    render(
      <LocationLink
        location={{ file: 'src/app.ts', startLine: 42 }}
        directory="/test"
        onClick={vi.fn()}
      />
    )
    expect(screen.getByTitle('src/app.ts:42')).toBeTruthy()
  })
})

describe('SeverityBadge', () => {
  it('renders info badge', () => {
    render(<SeverityBadge severity="info" />)
    expect(screen.getByText('info')).toBeTruthy()
    expect(screen.getByText('info').className).toContain('blue')
  })

  it('renders warning badge', () => {
    render(<SeverityBadge severity="warning" />)
    expect(screen.getByText('warning')).toBeTruthy()
    expect(screen.getByText('warning').className).toContain('yellow')
  })

  it('renders concern badge', () => {
    render(<SeverityBadge severity="concern" />)
    expect(screen.getByText('concern')).toBeTruthy()
    expect(screen.getByText('concern').className).toContain('red')
  })
})

describe('ChangeStatusBadge', () => {
  it('renders addressed badge', () => {
    render(<ChangeStatusBadge status="addressed" />)
    expect(screen.getByText('Addressed')).toBeTruthy()
    expect(screen.getByText('Addressed').className).toContain('green')
  })

  it('renders not-addressed badge', () => {
    render(<ChangeStatusBadge status="not-addressed" />)
    expect(screen.getByText('Not addressed')).toBeTruthy()
    expect(screen.getByText('Not addressed').className).toContain('red')
  })

  it('renders partially-addressed badge', () => {
    render(<ChangeStatusBadge status="partially-addressed" />)
    expect(screen.getByText('Partial')).toBeTruthy()
    expect(screen.getByText('Partial').className).toContain('yellow')
  })
})
