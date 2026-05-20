// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '../../../test/react-setup'
import { CommandsEditor } from './CommandsEditor'

// Mock getUserCommandsConfigPath so it doesn't call window.app.homedir (which is memoised)
vi.mock('../../features/commands/userConfigPath', () => ({
  getUserCommandsConfigPath: vi.fn().mockResolvedValue('/Users/test/.broomy/commands.json'),
  userCommandsDir: (home: string) => `${home}/.broomy`,
  _resetUserCommandsCacheForTest: vi.fn(),
}))

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(window.fs.exists).mockResolvedValue(false)
  vi.mocked(window.fs.readFile).mockRejectedValue(new Error('not found'))
  vi.mocked(window.fs.writeFile).mockResolvedValue({ success: true })
  vi.mocked(window.fs.mkdir).mockResolvedValue({ success: true })
})

describe('CommandsEditor', () => {
  it('shows User/Project tabs', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false)
    render(<CommandsEditor directory="/repo" onClose={vi.fn()} />)
    expect(await screen.findByRole('tab', { name: /user/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /project/i })).toBeInTheDocument()
  })

  it('lists user commands on the left when User tab is selected', async () => {
    vi.mocked(window.fs.exists).mockImplementation(async (p: string) => p === '/Users/test/.broomy/commands.json')
    vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify({
      version: 2, actions: [{ id: 'u', label: 'My Cmd', template: '/x' }],
    }))
    render(<CommandsEditor directory="/repo" onClose={vi.fn()} />)
    expect(await screen.findByText('My Cmd')).toBeInTheDocument()
    expect(screen.getByText('/x')).toBeInTheDocument()
  })

  it('selecting a row populates the right pane', async () => {
    vi.mocked(window.fs.exists).mockImplementation(async (p: string) => p === '/Users/test/.broomy/commands.json')
    vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify({
      version: 2, actions: [{ id: 'u', label: 'My Cmd', template: '/x', description: 'help' }],
    }))
    render(<CommandsEditor directory="/repo" onClose={vi.fn()} />)
    fireEvent.click(await screen.findByText('My Cmd'))
    expect(screen.getByDisplayValue('My Cmd')).toBeInTheDocument()
    expect(screen.getByDisplayValue('help')).toBeInTheDocument()
    expect(screen.getByDisplayValue('/x')).toBeInTheDocument()
  })

  it('args table populates from template placeholders', async () => {
    vi.mocked(window.fs.exists).mockImplementation(async (p: string) => p === '/Users/test/.broomy/commands.json')
    vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify({
      version: 2, actions: [{ id: 'u', label: 'L', template: '/plan {topic} --depth {depth}' }],
    }))
    render(<CommandsEditor directory="/repo" onClose={vi.fn()} />)
    fireEvent.click(await screen.findByText('L'))
    expect(screen.getByText('topic')).toBeInTheDocument()
    expect(screen.getByText('depth')).toBeInTheDocument()
    expect(screen.getAllByText(/optional/i).length).toBeGreaterThan(0)
  })

  it('Save writes the file', async () => {
    vi.mocked(window.fs.exists).mockImplementation(async (p: string) => p === '/Users/test/.broomy/commands.json')
    vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify({
      version: 2, actions: [{ id: 'u', label: 'A', template: 't' }],
    }))
    render(<CommandsEditor directory="/repo" onClose={vi.fn()} />)
    fireEvent.click(await screen.findByText('A'))
    fireEvent.change(screen.getByDisplayValue('A'), { target: { value: 'B' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(vi.mocked(window.fs.writeFile)).toHaveBeenCalled())
  })

  it('switching to Project tab with no file shows Add CTA', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false)
    render(<CommandsEditor directory="/repo" onClose={vi.fn()} />)
    fireEvent.click(await screen.findByRole('tab', { name: /project/i }))
    expect(screen.getByRole('button', { name: /add project commands/i })).toBeInTheDocument()
  })
})
