import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveBaseRef } from './baseRef'

const defaultBranch = vi.fn()
const fetchBranch = vi.fn()

beforeEach(() => {
  defaultBranch.mockReset()
  fetchBranch.mockReset()
  fetchBranch.mockResolvedValue({ success: true })
  ;(window as unknown as { git: unknown }).git = { defaultBranch, fetchBranch }
})

describe('resolveBaseRef', () => {
  it('bases the new branch on the remote-tracking ref, not the local branch', async () => {
    defaultBranch.mockResolvedValue('master')

    const result = await resolveBaseRef('/repo/main', 'master')

    expect(result).toBe('origin/master')
    expect(fetchBranch).toHaveBeenCalledWith('/repo/main', 'master')
  })

  it('prefers the live default branch over the value stored in config', async () => {
    defaultBranch.mockResolvedValue('main')

    const result = await resolveBaseRef('/repo/main', 'master')

    expect(result).toBe('origin/main')
    expect(fetchBranch).toHaveBeenCalledWith('/repo/main', 'main')
  })

  it('falls back to the stored default branch when git cannot resolve one', async () => {
    defaultBranch.mockRejectedValue(new Error('not a repo'))

    const result = await resolveBaseRef('/repo/main', 'develop')

    expect(result).toBe('origin/develop')
  })

  it('falls back to the stored default branch when git returns an empty name', async () => {
    defaultBranch.mockResolvedValue('')

    const result = await resolveBaseRef('/repo/main', 'develop')

    expect(result).toBe('origin/develop')
  })

  it('throws instead of silently branching from stale code when the fetch fails', async () => {
    defaultBranch.mockResolvedValue('master')
    fetchBranch.mockResolvedValue({ success: false, error: 'network down' })

    await expect(resolveBaseRef('/repo/main', 'master')).rejects.toThrow(/network down/)
  })
})
