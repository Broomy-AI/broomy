// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../test/react-setup'
import { EnvVarEditor } from './EnvVarEditor'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('EnvVarEditor', () => {
  it('renders the Environment Variables label', () => {
    render(<EnvVarEditor env={{}} onChange={vi.fn()} command="" />)
    expect(screen.getByText('Environment Variables')).toBeTruthy()
  })

  it('renders existing env vars with disabled key and editable value', () => {
    const env = { MY_KEY: 'my-value', OTHER_KEY: 'other-value' }
    const { container } = render(<EnvVarEditor env={env} onChange={vi.fn()} command="" />)
    const inputs = container.querySelectorAll('input')
    // Existing vars: 2 pairs (key + value) = 4 inputs, plus new key/value = 2 more = 6 total
    expect(inputs.length).toBe(6)

    // First pair: key is disabled
    expect(inputs[0].value).toBe('MY_KEY')
    expect(inputs[0].disabled).toBe(true)
    expect(inputs[1].value).toBe('my-value')
    expect(inputs[1].disabled).toBe(false)
  })

  it('calls onChange when an existing value is modified', () => {
    const onChange = vi.fn()
    render(<EnvVarEditor env={{ MY_KEY: 'old' }} onChange={onChange} command="" />)
    const valueInput = screen.getByDisplayValue('old')
    fireEvent.change(valueInput, { target: { value: 'new-value' } })
    expect(onChange).toHaveBeenCalledWith({ MY_KEY: 'new-value' })
  })

  it('calls onChange when Remove button is clicked', () => {
    const onChange = vi.fn()
    render(<EnvVarEditor env={{ MY_KEY: 'val' }} onChange={onChange} command="" />)
    const removeButton = screen.getByTitle('Remove')
    fireEvent.click(removeButton)
    expect(onChange).toHaveBeenCalledWith({})
  })

  it('renders add new env var inputs', () => {
    render(<EnvVarEditor env={{}} onChange={vi.fn()} command="" />)
    expect(screen.getByPlaceholderText('KEY')).toBeTruthy()
    expect(screen.getByPlaceholderText('value')).toBeTruthy()
    expect(screen.getByText('Add')).toBeTruthy()
  })

  it('disables Add button when key is empty', () => {
    render(<EnvVarEditor env={{}} onChange={vi.fn()} command="" />)
    const addButton = screen.getByText('Add')
    expect(addButton).toHaveProperty('disabled', true)
  })

  it('adds a new env var when Add is clicked', () => {
    const onChange = vi.fn()
    render(<EnvVarEditor env={{}} onChange={onChange} command="" />)
    const keyInput = screen.getByPlaceholderText('KEY')
    const valueInput = screen.getByPlaceholderText('value')
    fireEvent.change(keyInput, { target: { value: 'NEW_KEY' } })
    fireEvent.change(valueInput, { target: { value: 'new_val' } })
    fireEvent.click(screen.getByText('Add'))
    expect(onChange).toHaveBeenCalledWith({ NEW_KEY: 'new_val' })
  })

  it('does not call onChange when Add is clicked with empty key', () => {
    const onChange = vi.fn()
    render(<EnvVarEditor env={{}} onChange={onChange} command="" />)
    fireEvent.click(screen.getByText('Add'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('clears key and value inputs after adding', () => {
    const onChange = vi.fn()
    render(<EnvVarEditor env={{}} onChange={onChange} command="" />)
    const keyInput = screen.getByPlaceholderText('KEY')
    const valueInput = screen.getByPlaceholderText('value')
    fireEvent.change(keyInput, { target: { value: 'FOO' } })
    fireEvent.change(valueInput, { target: { value: 'bar' } })
    fireEvent.click(screen.getByText('Add'))
    expect((keyInput as HTMLInputElement).value).toBe('')
    expect((valueInput as HTMLInputElement).value).toBe('')
  })

  it('shows suggestions for claude command', () => {
    render(<EnvVarEditor env={{}} onChange={vi.fn()} command="claude" />)
    expect(screen.getByText('+ CLAUDE_CONFIG_DIR')).toBeTruthy()
  })

  it('does not show suggestions for unknown commands', () => {
    render(<EnvVarEditor env={{}} onChange={vi.fn()} command="unknown-agent" />)
    expect(screen.queryByText(/^\+ /)).toBeNull()
  })

  it('does not show suggestion if key is already in env', () => {
    render(<EnvVarEditor env={{ CLAUDE_CONFIG_DIR: '/custom' }} onChange={vi.fn()} command="claude" />)
    expect(screen.queryByText('+ CLAUDE_CONFIG_DIR')).toBeNull()
  })

  it('clicking a suggestion populates the new key field', () => {
    render(<EnvVarEditor env={{}} onChange={vi.fn()} command="claude" />)
    fireEvent.click(screen.getByText('+ CLAUDE_CONFIG_DIR'))
    const keyInput = screen.getByPlaceholderText('KEY') as HTMLInputElement
    expect(keyInput.value).toBe('CLAUDE_CONFIG_DIR')
  })
})
