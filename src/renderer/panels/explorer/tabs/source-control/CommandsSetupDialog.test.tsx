// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../../../test/react-setup'

vi.mock('../../../../features/commands/userConfigPath', async () => {
  const actual = await vi.importActual<typeof import('../../../../features/commands/userConfigPath')>('../../../../features/commands/userConfigPath')
  return {
    ...actual,
    getUserCommandsConfigPath: vi.fn().mockResolvedValue('/Users/test/.broomy/commands.json'),
  }
})

import { CommandsSetupDialog } from './CommandsSetupDialog'

beforeEach(() => {
  vi.mocked(window.fs.exists).mockResolvedValue(false)
  vi.mocked(window.fs.writeFile).mockResolvedValue({ success: true })
  vi.mocked(window.fs.mkdir).mockResolvedValue({ success: true })
  vi.mocked(window.app.homedir).mockResolvedValue('/Users/test')
})

afterEach(() => { cleanup() })

describe('CommandsSetupDialog', () => {
  it('renders three pack cards with Basics first', () => {
    render(<CommandsSetupDialog onClose={vi.fn()} onInstalled={vi.fn()} />)
    const cards = screen.getAllByTestId(/pack-card-/)
    expect(cards.map(c => c.dataset.testid)).toEqual(['pack-card-basics', 'pack-card-superpowers', 'pack-card-gstack'])
  })

  it('labels Basics as Recommended', () => {
    render(<CommandsSetupDialog onClose={vi.fn()} onInstalled={vi.fn()} />)
    expect(screen.getByText(/recommended/i)).toBeInTheDocument()
  })

  it('writes the chosen pack to ~/.broomy/commands.json and calls onInstalled', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false)
    const onInstalled = vi.fn()
    render(<CommandsSetupDialog onClose={vi.fn()} onInstalled={onInstalled} />)
    fireEvent.click(screen.getByTestId('pack-card-basics'))
    fireEvent.click(screen.getByRole('button', { name: /install/i }))
    // wait one tick
    await new Promise(r => setTimeout(r, 0))
    expect(vi.mocked(window.fs.writeFile)).toHaveBeenCalledWith(
      '/Users/test/.broomy/commands.json',
      expect.stringContaining('"id": "commit"'),
    )
    expect(onInstalled).toHaveBeenCalled()
  })

  it('prompts to replace existing user commands', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    render(<CommandsSetupDialog onClose={vi.fn()} onInstalled={vi.fn()} />)
    fireEvent.click(screen.getByTestId('pack-card-basics'))
    fireEvent.click(screen.getByRole('button', { name: /install/i }))
    await new Promise(r => setTimeout(r, 0))
    expect(screen.getByText(/replace existing user commands/i)).toBeInTheDocument()
  })
})
