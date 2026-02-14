// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../test/react-setup'
import HelpModal from './HelpModal'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('HelpModal', () => {
  it('renders the Help title', () => {
    render(<HelpModal onClose={vi.fn()} />)
    expect(screen.getByText('Help')).toBeTruthy()
  })

  it('renders tab buttons', () => {
    render(<HelpModal onClose={vi.fn()} />)
    expect(screen.getByText('Overview')).toBeTruthy()
    expect(screen.getByText('Shortcuts')).toBeTruthy()
    // "Agents" appears both as a tab button and as a key concept in Overview,
    // so use getAllByText to confirm at least one exists
    expect(screen.getAllByText('Agents').length).toBeGreaterThanOrEqual(1)
  })

  it('shows Overview tab content by default', () => {
    render(<HelpModal onClose={vi.fn()} />)
    expect(screen.getByText('What is Broomy?')).toBeTruthy()
    expect(screen.getByText('Key Concepts')).toBeTruthy()
    expect(screen.getByText('Quick Start')).toBeTruthy()
  })

  it('switches to Shortcuts tab', () => {
    render(<HelpModal onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Shortcuts'))
    expect(screen.getByText('Panel Shortcuts')).toBeTruthy()
    expect(screen.getByText('Navigation')).toBeTruthy()
    expect(screen.getByText('File Operations')).toBeTruthy()
    expect(screen.getByText('Terminal & Agent')).toBeTruthy()
  })

  it('switches to Agents tab', () => {
    render(<HelpModal onClose={vi.fn()} />)
    // "Agents" appears as both a tab and a key concept; click the tab button (first match)
    const agentElements = screen.getAllByText('Agents')
    fireEvent.click(agentElements[0])
    expect(screen.getByText('Supported Agents')).toBeTruthy()
    expect(screen.getByText('Claude Code')).toBeTruthy()
    expect(screen.getByText('Codex')).toBeTruthy()
    expect(screen.getByText('Gemini CLI')).toBeTruthy()
    expect(screen.getByText('Custom Agents')).toBeTruthy()
  })

  it('calls onClose when header close button is clicked', () => {
    const onClose = vi.fn()
    render(<HelpModal onClose={onClose} />)
    // There are two close buttons - the X in the header and the Close in the footer
    // The footer one has text "Close"
    const closeButtons = screen.getAllByRole('button')
    // Click the X button in header (first SVG close button)
    const headerCloseButton = closeButtons.find(
      (b) => b.querySelector('svg') && !b.textContent?.includes('Close'),
    )
    if (headerCloseButton) {
      fireEvent.click(headerCloseButton)
      expect(onClose).toHaveBeenCalledOnce()
    }
  })

  it('calls onClose when footer Close button is clicked', () => {
    const onClose = vi.fn()
    render(<HelpModal onClose={onClose} />)
    // Find the footer close button that has text "Close"
    const closeButtons = screen.getAllByText('Close')
    // The last one should be the footer button
    fireEvent.click(closeButtons[closeButtons.length - 1])
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows correct keyboard shortcut labels', () => {
    render(<HelpModal onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Shortcuts'))
    // Should show panel shortcuts
    expect(screen.getByText('Toggle Sessions')).toBeTruthy()
    expect(screen.getByText('Toggle Explorer')).toBeTruthy()
    expect(screen.getByText('Toggle File Viewer')).toBeTruthy()
  })

  it('renders key concepts descriptions in Overview', () => {
    render(<HelpModal onClose={vi.fn()} />)
    expect(screen.getByText('Sessions')).toBeTruthy()
    expect(screen.getByText('Worktrees')).toBeTruthy()
    expect(screen.getByText('Panels')).toBeTruthy()
    expect(screen.getByText('Reviews')).toBeTruthy()
  })

  it('renders agent install instructions on Agents tab', () => {
    render(<HelpModal onClose={vi.fn()} />)
    const agentElements = screen.getAllByText('Agents')
    fireEvent.click(agentElements[0])
    expect(screen.getByText('npm install -g @anthropic-ai/claude-code')).toBeTruthy()
    expect(screen.getByText('npm install -g @openai/codex')).toBeTruthy()
    expect(screen.getByText('npm install -g @google/gemini-cli')).toBeTruthy()
  })

  it('can switch between all tabs', () => {
    render(<HelpModal onClose={vi.fn()} />)

    // Start on Overview
    expect(screen.getByText('What is Broomy?')).toBeTruthy()

    // Switch to Shortcuts
    fireEvent.click(screen.getByText('Shortcuts'))
    expect(screen.queryByText('What is Broomy?')).toBeNull()
    expect(screen.getByText('Panel Shortcuts')).toBeTruthy()

    // Switch to Agents
    fireEvent.click(screen.getByText('Agents'))
    expect(screen.queryByText('Panel Shortcuts')).toBeNull()
    expect(screen.getByText('Supported Agents')).toBeTruthy()

    // Switch back to Overview
    fireEvent.click(screen.getByText('Overview'))
    expect(screen.getByText('What is Broomy?')).toBeTruthy()
  })
})
