// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import '../../test/react-setup'

vi.mock('../utils/commandsConfig', () => ({
  loadCommandsConfig: vi.fn(),
}))

import { useCommandsConfig } from './useCommandsConfig'
import { loadCommandsConfig } from '../utils/commandsConfig'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(window.fs.watch).mockResolvedValue({ success: true })
  vi.mocked(window.fs.unwatch).mockResolvedValue(undefined as never)
  vi.mocked(window.fs.onChange).mockReturnValue(() => {})
})

describe('useCommandsConfig', () => {
  it('returns null config when directory is undefined', () => {
    const { result } = renderHook(() => useCommandsConfig(undefined))
    expect(result.current.config).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(result.current.exists).toBe(false)
  })

  it('loads config when directory is provided', async () => {
    const mockConfig = { version: 1, actions: [] }
    vi.mocked(loadCommandsConfig).mockResolvedValue({ ok: true, config: mockConfig })

    const { result } = renderHook(() => useCommandsConfig('/repo'))

    await act(async () => {
      await new Promise(r => setTimeout(r, 10))
    })

    expect(result.current.config).toEqual(mockConfig)
    expect(result.current.exists).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('sets error when config is invalid', async () => {
    vi.mocked(loadCommandsConfig).mockResolvedValue({ ok: false, error: 'bad json' })

    const { result } = renderHook(() => useCommandsConfig('/repo'))

    await act(async () => {
      await new Promise(r => setTimeout(r, 10))
    })

    expect(result.current.config).toBeNull()
    expect(result.current.exists).toBe(true)
    expect(result.current.error).toBe('bad json')
  })

  it('sets exists to false when no commands.json found', async () => {
    vi.mocked(loadCommandsConfig).mockResolvedValue(null)

    const { result } = renderHook(() => useCommandsConfig('/repo'))

    await act(async () => {
      await new Promise(r => setTimeout(r, 10))
    })

    expect(result.current.config).toBeNull()
    expect(result.current.exists).toBe(false)
    expect(result.current.error).toBeNull()
  })
})
