// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../test/react-setup'

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn()

// Mock the tutorial store
const mockUseTutorialStore = vi.fn()

vi.mock('../store/tutorial', () => ({
  useTutorialStore: (selector?: (state: unknown) => unknown) => {
    const state = mockUseTutorialStore()
    return selector ? selector(state) : state
  },
  TUTORIAL_STEPS: [
    { id: 'step-1', title: 'First Step', description: 'Do the first thing.' },
    { id: 'step-2', title: 'Second Step', description: 'Do the second thing.', link: { label: 'Learn more', url: 'https://example.com' } },
    { id: 'step-3', title: 'Third Step', description: 'Do the third thing.' },
  ],
}))

import TutorialPanel from './TutorialPanel'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
  mockUseTutorialStore.mockReturnValue({
    completedSteps: [],
    resetProgress: vi.fn(),
  })
})

describe('TutorialPanel', () => {
  it('renders the Getting Started header', () => {
    render(<TutorialPanel />)
    expect(screen.getByText('Getting Started')).toBeTruthy()
  })

  it('shows progress count', () => {
    render(<TutorialPanel />)
    expect(screen.getByText('0/3')).toBeTruthy()
  })

  it('renders all tutorial step titles', () => {
    render(<TutorialPanel />)
    expect(screen.getByText('First Step')).toBeTruthy()
    expect(screen.getByText('Second Step')).toBeTruthy()
    expect(screen.getByText('Third Step')).toBeTruthy()
  })

  it('expands the first incomplete step by default', () => {
    render(<TutorialPanel />)
    // First step description should be visible since it's expanded
    expect(screen.getByText('Do the first thing.')).toBeTruthy()
  })

  it('toggles step expansion on click', () => {
    render(<TutorialPanel />)

    // First step is expanded, click to collapse
    fireEvent.click(screen.getByText('First Step'))
    expect(screen.queryByText('Do the first thing.')).toBeNull()

    // Click again to expand
    fireEvent.click(screen.getByText('First Step'))
    expect(screen.getByText('Do the first thing.')).toBeTruthy()
  })

  it('shows step link when present', () => {
    render(<TutorialPanel />)
    // Click on second step to expand it
    fireEvent.click(screen.getByText('Second Step'))
    expect(screen.getByText('Learn more')).toBeTruthy()
  })

  it('opens external link when link button is clicked', () => {
    render(<TutorialPanel />)
    fireEvent.click(screen.getByText('Second Step'))
    fireEvent.click(screen.getByText('Learn more'))
    expect(window.shell.openExternal).toHaveBeenCalledWith('https://example.com')
  })

  it('shows completed progress when steps are done', () => {
    mockUseTutorialStore.mockReturnValue({
      completedSteps: ['step-1', 'step-2'],
      resetProgress: vi.fn(),
    })
    render(<TutorialPanel />)
    expect(screen.getByText('2/3')).toBeTruthy()
  })

  it('shows all complete message when all steps are done', () => {
    mockUseTutorialStore.mockReturnValue({
      completedSteps: ['step-1', 'step-2', 'step-3'],
      resetProgress: vi.fn(),
    })
    render(<TutorialPanel />)
    expect(screen.getByText('All steps complete!')).toBeTruthy()
  })

  it('expands next incomplete step when steps complete', () => {
    mockUseTutorialStore.mockReturnValue({
      completedSteps: ['step-1'],
      resetProgress: vi.fn(),
    })
    render(<TutorialPanel />)
    // Second step (first incomplete) should be expanded
    expect(screen.getByText('Do the second thing.')).toBeTruthy()
  })

  it('shows step numbers for incomplete steps', () => {
    render(<TutorialPanel />)
    // Incomplete steps show their number
    expect(screen.getByText('1')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
  })
})
