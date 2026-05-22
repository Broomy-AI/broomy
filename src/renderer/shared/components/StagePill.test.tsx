// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import { StagePill } from './StagePill'

afterEach(() => {
  cleanup()
})

describe('StagePill', () => {
  it('renders the current stage', () => {
    render(<StagePill currentStage="planning" allStages={['new', 'planning']} onSelect={vi.fn()} />)
    expect(screen.getByText('planning')).toBeInTheDocument()
  })

  it('opens a popover on click and lists all stages', () => {
    render(<StagePill currentStage="new" allStages={['new', 'planning', 'building']} onSelect={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /stage:/i }))
    expect(screen.getByRole('menuitem', { name: 'new' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'planning' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'building' })).toBeInTheDocument()
  })

  it('calls onSelect when a stage is chosen', () => {
    const onSelect = vi.fn()
    render(<StagePill currentStage="new" allStages={['new', 'planning']} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: /stage:/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'planning' }))
    expect(onSelect).toHaveBeenCalledWith('planning')
  })
})
