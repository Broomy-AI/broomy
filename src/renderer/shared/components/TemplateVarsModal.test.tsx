// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import { TemplateVarsModal } from './TemplateVarsModal'

afterEach(() => { cleanup() })

const varInput = { directory: '/repos/broomy/wt/fix-login' }

describe('TemplateVarsModal', () => {
  it('renders a row per variable, grouped', () => {
    render(<TemplateVarsModal surface="command" varInput={varInput} onInsert={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('{branch}')).toBeInTheDocument()
    expect(screen.getByText('{prTitle}')).toBeInTheDocument()
    expect(screen.getByText('Pull request')).toBeInTheDocument()
  })

  it('shows the BROOMY_ form on shell surfaces', () => {
    render(<TemplateVarsModal surface="init" varInput={varInput} onInsert={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('$BROOMY_BRANCH')).toBeInTheDocument()
    expect(screen.queryByText('{branch}')).not.toBeInTheDocument()
  })

  it('shows the {} form for agent env values', () => {
    render(<TemplateVarsModal surface="envValue" varInput={varInput} onInsert={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('{branch}')).toBeInTheDocument()
  })

  it('shows the live value for a variable that has one', () => {
    render(<TemplateVarsModal surface="command" varInput={varInput} onInsert={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('fix-login')).toBeInTheDocument()
  })

  it('shows a dash for a variable with no value', () => {
    render(<TemplateVarsModal surface="command" varInput={varInput} onInsert={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('filters by name and description', () => {
    render(<TemplateVarsModal surface="command" varInput={varInput} onInsert={vi.fn()} onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Search variables…'), { target: { value: 'issue' } })
    expect(screen.getByText('{issueTitle}')).toBeInTheDocument()
    expect(screen.queryByText('{branch}')).not.toBeInTheDocument()
  })

  it('reports when nothing matches the search', () => {
    render(<TemplateVarsModal surface="command" varInput={varInput} onInsert={vi.fn()} onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Search variables…'), { target: { value: 'zzzz' } })
    expect(screen.getByText('No variables match.')).toBeInTheDocument()
  })

  it('inserts the variable and closes on click', () => {
    const onInsert = vi.fn()
    const onClose = vi.fn()
    render(<TemplateVarsModal surface="command" varInput={varInput} onInsert={onInsert} onClose={onClose} />)
    fireEvent.click(screen.getByText('{branch}'))
    expect(onInsert).toHaveBeenCalledWith('{branch}')
    expect(onClose).toHaveBeenCalled()
  })

  it('does not insert an unavailable variable and explains why', () => {
    const onInsert = vi.fn()
    render(<TemplateVarsModal surface="init" varInput={varInput} onInsert={onInsert} onClose={vi.fn()} />)
    expect(screen.getAllByText('not set when the init script runs').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByText('$BROOMY_PR_TITLE'))
    expect(onInsert).not.toHaveBeenCalled()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<TemplateVarsModal surface="command" varInput={varInput} onInsert={vi.fn()} onClose={onClose} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on backdrop click and on the close button', () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <TemplateVarsModal surface="command" varInput={varInput} onInsert={vi.fn()} onClose={onClose} />
    )
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)

    rerender(<TemplateVarsModal surface="command" varInput={varInput} onInsert={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('close-template-vars'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('shows a custom footer note when given one', () => {
    render(
      <TemplateVarsModal
        surface="agent" varInput={varInput} onInsert={vi.fn()} onClose={vi.fn()}
        footerNote="PR values are empty until the branch has a PR."
      />
    )
    expect(screen.getByText('PR values are empty until the branch has a PR.')).toBeInTheDocument()
  })
})
