// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../test/react-setup'
import ShortcutsModal from './ShortcutsModal'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ShortcutsModal', () => {
  it('renders the modal with title', () => {
    render(<ShortcutsModal onClose={vi.fn()} />)
    expect(screen.getByText('Keyboard Shortcuts')).toBeTruthy()
  })

  it('renders all shortcut groups', () => {
    render(<ShortcutsModal onClose={vi.fn()} />)
    expect(screen.getByText('Panel Shortcuts')).toBeTruthy()
    expect(screen.getByText('Navigation')).toBeTruthy()
    expect(screen.getByText('File Operations')).toBeTruthy()
    expect(screen.getByText('Terminal & Agent')).toBeTruthy()
    expect(screen.getByText('Debug')).toBeTruthy()
  })

  it('renders individual shortcuts', () => {
    render(<ShortcutsModal onClose={vi.fn()} />)
    expect(screen.getByText('Toggle Sessions')).toBeTruthy()
    expect(screen.getByText('Toggle Explorer')).toBeTruthy()
    expect(screen.getByText('Toggle Agent')).toBeTruthy()
    expect(screen.getByText('Save File')).toBeTruthy()
    expect(screen.getByText('Search Files')).toBeTruthy()
    expect(screen.getByText('Cycle Panels Forward')).toBeTruthy()
  })

  it('shows keyboard shortcut keys', () => {
    render(<ShortcutsModal onClose={vi.fn()} />)
    expect(screen.getByText('Ctrl+Tab')).toBeTruthy()
    expect(screen.getByText('Ctrl+Shift+Tab')).toBeTruthy()
  })

  it('calls onClose when close button (X) is clicked', () => {
    const onClose = vi.fn()
    render(<ShortcutsModal onClose={onClose} />)
    // There are two close buttons - the X in the header and the Close button in footer
    // Click the footer Close button
    fireEvent.click(screen.getByText('Close'))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when header X button is clicked', () => {
    const onClose = vi.fn()
    const { container } = render(<ShortcutsModal onClose={onClose} />)
    // The X button in the header - it's the button inside the header div
    const headerCloseBtn = container.querySelector('.border-b button')!
    fireEvent.click(headerCloseBtn)
    expect(onClose).toHaveBeenCalled()
  })

  it('renders with correct platform modifier key', () => {
    render(<ShortcutsModal onClose={vi.fn()} />)
    const isMac = navigator.userAgent.toUpperCase().includes('MAC')
    const modKey = isMac ? 'Cmd' : 'Ctrl'
    // Check that modifier keys are present in some form
    expect(screen.getByText(`${modKey}+1`)).toBeTruthy()
    expect(screen.getByText(`${modKey}+S`)).toBeTruthy()
    expect(screen.getByText(`${modKey}+P`)).toBeTruthy()
  })

  it('renders debug shortcut', () => {
    render(<ShortcutsModal onClose={vi.fn()} />)
    expect(screen.getByText('Copy Terminal + Session Info')).toBeTruthy()
  })

  it('renders terminal shortcuts', () => {
    render(<ShortcutsModal onClose={vi.fn()} />)
    expect(screen.getByText('New Line (without submitting)')).toBeTruthy()
    expect(screen.getByText('Shift+Enter')).toBeTruthy()
  })
})
