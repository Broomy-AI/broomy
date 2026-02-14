// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import { CollapsibleSection } from './CollapsibleSection'

afterEach(() => {
  cleanup()
})

describe('CollapsibleSection', () => {
  it('renders title', () => {
    render(
      <CollapsibleSection title="Test Section">
        <div>Content</div>
      </CollapsibleSection>
    )
    expect(screen.getByText('Test Section')).toBeTruthy()
  })

  it('is collapsed by default', () => {
    render(
      <CollapsibleSection title="Test Section">
        <div>Hidden Content</div>
      </CollapsibleSection>
    )
    expect(screen.queryByText('Hidden Content')).toBeNull()
  })

  it('opens when defaultOpen is true', () => {
    render(
      <CollapsibleSection title="Test Section" defaultOpen={true}>
        <div>Visible Content</div>
      </CollapsibleSection>
    )
    expect(screen.getByText('Visible Content')).toBeTruthy()
  })

  it('toggles open on click', () => {
    render(
      <CollapsibleSection title="Test Section">
        <div>Toggle Content</div>
      </CollapsibleSection>
    )
    expect(screen.queryByText('Toggle Content')).toBeNull()
    fireEvent.click(screen.getByText('Test Section'))
    expect(screen.getByText('Toggle Content')).toBeTruthy()
  })

  it('toggles closed on second click', () => {
    render(
      <CollapsibleSection title="Test Section" defaultOpen={true}>
        <div>Toggle Content</div>
      </CollapsibleSection>
    )
    expect(screen.getByText('Toggle Content')).toBeTruthy()
    fireEvent.click(screen.getByText('Test Section'))
    expect(screen.queryByText('Toggle Content')).toBeNull()
  })

  it('shows count badge when count is provided and > 0', () => {
    render(
      <CollapsibleSection title="Items" count={5}>
        <div>Content</div>
      </CollapsibleSection>
    )
    expect(screen.getByText('5')).toBeTruthy()
  })

  it('does not show count badge when count is 0', () => {
    render(
      <CollapsibleSection title="Items" count={0}>
        <div>Content</div>
      </CollapsibleSection>
    )
    // Title is visible but no "0" badge
    expect(screen.getByText('Items')).toBeTruthy()
    expect(screen.queryByText('0')).toBeNull()
  })

  it('does not show count badge when count is undefined', () => {
    const { container } = render(
      <CollapsibleSection title="Items">
        <div>Content</div>
      </CollapsibleSection>
    )
    // Should not have a count badge span
    const badges = container.querySelectorAll('.rounded-full')
    expect(badges).toHaveLength(0)
  })
})
