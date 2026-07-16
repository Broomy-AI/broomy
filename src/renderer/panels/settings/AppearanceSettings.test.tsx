// @vitest-environment jsdom
/**
 * Covers the "Status indicator colour" control: the pressed states of the Green /
 * Match-accent swatches, the custom path, the help copy per mode, and the onChange
 * emissions. Renders on the light theme, where the green is the visible non-text emerald.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import { AppearanceSettings } from './AppearanceSettings'
import { DEFAULT_APPEARANCE, type Appearance } from '../../../shared/appearance'

afterEach(() => cleanup())

const renderPanel = (patch: Partial<Appearance> = {}) => {
  const onChange = vi.fn()
  render(
    <AppearanceSettings
      appearance={{ ...DEFAULT_APPEARANCE, ...patch }}
      resolvedTheme="light"
      onChange={onChange}
      onReset={vi.fn()}
    />
  )
  return onChange
}

describe('AppearanceSettings — status indicator colour control', () => {
  it('renders the control with Green pressed by default', () => {
    renderPanel({ statusColor: 'default' })
    expect(screen.getByText('Status indicator colour')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Green (default)' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Match accent' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText(/ready \/ check-me green/i)).toBeInTheDocument()
  })

  it("marks 'Match accent' pressed and explains it follows the accent", () => {
    renderPanel({ statusColor: 'accent' })
    expect(screen.getByRole('button', { name: 'Match accent' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Follows your accent colour above.')).toBeInTheDocument()
  })

  it('renders the custom path without pressing either preset swatch', () => {
    renderPanel({ statusColor: '#ff00ff' })
    expect(screen.getByRole('button', { name: 'Green (default)' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Match accent' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByLabelText('Custom status colour')).toBeInTheDocument()
  })

  it('emits the preference when a swatch is clicked', () => {
    const onChange = renderPanel({ statusColor: 'default' })
    fireEvent.click(screen.getByRole('button', { name: 'Match accent' }))
    expect(onChange).toHaveBeenCalledWith({ statusColor: 'accent' })
    fireEvent.click(screen.getByRole('button', { name: 'Green (default)' }))
    expect(onChange).toHaveBeenCalledWith({ statusColor: 'default' })
  })
})
