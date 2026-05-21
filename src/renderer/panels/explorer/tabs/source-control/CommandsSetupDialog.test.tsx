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
  it('renders the Basics pack card', () => {
    render(<CommandsSetupDialog onClose={vi.fn()} onInstalled={vi.fn()} />)
    expect(screen.getByTestId('pack-card-basics')).toBeInTheDocument()
  })

  it('renders a "more starter packs coming" placeholder', () => {
    render(<CommandsSetupDialog onClose={vi.fn()} onInstalled={vi.fn()} />)
    expect(screen.getByTestId('pack-card-coming-soon')).toBeInTheDocument()
    expect(screen.getByText(/more starter packs coming/i)).toBeInTheDocument()
  })

  it('writes the Basics pack to ~/.broomy/commands.json and calls onInstalled', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false)
    const onInstalled = vi.fn()
    render(<CommandsSetupDialog onClose={vi.fn()} onInstalled={onInstalled} />)
    fireEvent.click(screen.getByTestId('pack-card-basics'))
    fireEvent.click(screen.getByRole('button', { name: /^install(ing)?$/i }))
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
    fireEvent.click(screen.getByRole('button', { name: /^install(ing)?$/i }))
    await new Promise(r => setTimeout(r, 0))
    expect(screen.getByText(/replace existing user commands/i)).toBeInTheDocument()
  })

  it('enables Install immediately when Basics is selected (no plugin required)', () => {
    render(<CommandsSetupDialog onClose={vi.fn()} onInstalled={vi.fn()} />)
    fireEvent.click(screen.getByTestId('pack-card-basics'))
    const installBtn = screen.getByRole('button', { name: /^install(ing)?$/i })
    expect(installBtn).not.toBeDisabled()
  })
})
