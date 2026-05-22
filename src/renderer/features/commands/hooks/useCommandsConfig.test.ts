// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { _resetUserCommandsCacheForTest } from '../userConfigPath'

beforeEach(() => {
  vi.clearAllMocks()
  _resetUserCommandsCacheForTest()
  vi.mocked(window.app.homedir).mockResolvedValue('/Users/test')
  vi.mocked(window.fs.watch).mockResolvedValue({ success: true })
  vi.mocked(window.fs.unwatch).mockResolvedValue({ success: true })
  vi.mocked(window.fs.onChange).mockReturnValue(() => undefined)
})

describe('useCommandsConfig', () => {
  it('returns null/null when neither file exists', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false)
    const { useCommandsConfig } = await import('./useCommandsConfig')
    const { result } = renderHook(() => useCommandsConfig('/repo'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toBeNull()
    expect(result.current.project).toBeNull()
    expect(result.current.merged).toBeNull()
  })

  it('loads user-only when only ~/.broomy/commands.json exists', async () => {
    vi.mocked(window.fs.exists).mockImplementation(async (p: string) => p === '/Users/test/.broomy/commands.json')
    vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify({
      version: 2, actions: [{ id: 'u', label: 'User', template: 't' }],
    }))
    const { useCommandsConfig } = await import('./useCommandsConfig')
    const { result } = renderHook(() => useCommandsConfig('/repo'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user?.actions[0].id).toBe('u')
    expect(result.current.project).toBeNull()
    expect(result.current.merged?.actions.map(a => a.id)).toEqual(['u'])
  })

  it('concatenates user + project actions', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    vi.mocked(window.fs.readFile).mockImplementation(async (p: string) => {
      if (p === '/Users/test/.broomy/commands.json') {
        return JSON.stringify({ version: 2, actions: [{ id: 'u', label: 'U', template: 't' }] })
      }
      return JSON.stringify({ version: 2, actions: [{ id: 'p', label: 'P', template: 't' }] })
    })
    const { useCommandsConfig } = await import('./useCommandsConfig')
    const { result } = renderHook(() => useCommandsConfig('/repo'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.merged?.actions.map(a => a.id)).toEqual(['u', 'p'])
  })

  it('surfaces errors when a file fails validation', async () => {
    vi.mocked(window.fs.exists).mockImplementation(async (p: string) => p === '/Users/test/.broomy/commands.json')
    vi.mocked(window.fs.readFile).mockResolvedValue('not json')
    const { useCommandsConfig } = await import('./useCommandsConfig')
    const { result } = renderHook(() => useCommandsConfig('/repo'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.userError).toMatch(/Invalid JSON/)
  })
})
