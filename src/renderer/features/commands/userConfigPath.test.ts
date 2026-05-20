import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getUserCommandsConfigPath, _resetUserCommandsCacheForTest } from './userConfigPath'

beforeEach(() => {
  _resetUserCommandsCacheForTest()
  ;(globalThis as any).window = { app: { homedir: vi.fn().mockResolvedValue('/Users/test') } }
})

describe('getUserCommandsConfigPath', () => {
  it('joins homedir with .broomy/commands.json', async () => {
    expect(await getUserCommandsConfigPath()).toBe('/Users/test/.broomy/commands.json')
  })

  it('memoizes after first call', async () => {
    await getUserCommandsConfigPath()
    await getUserCommandsConfigPath()
    expect(((globalThis as any).window.app.homedir as any).mock.calls.length).toBe(1)
  })
})
