import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInvoke = vi.fn()
const mockOn = vi.fn()
const mockRemoveListener = vi.fn()
vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: (...args: unknown[]) => mockInvoke(...args),
    on: (...args: unknown[]) => mockOn(...args),
    removeListener: (...args: unknown[]) => mockRemoveListener(...args),
  },
}))

import { ptyApi } from './pty'

describe('preload pty API', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockOn.mockReset()
    mockRemoveListener.mockReset()
    mockInvoke.mockResolvedValue(undefined)
  })

  it('create invokes pty:create', async () => {
    const opts = { id: 'pty-1', cwd: '/test' }
    await ptyApi.create(opts)
    expect(mockInvoke).toHaveBeenCalledWith('pty:create', opts)
  })

  it('write invokes pty:write', async () => {
    await ptyApi.write('pty-1', 'data')
    expect(mockInvoke).toHaveBeenCalledWith('pty:write', 'pty-1', 'data')
  })

  it('resize invokes pty:resize', async () => {
    await ptyApi.resize('pty-1', 80, 24)
    expect(mockInvoke).toHaveBeenCalledWith('pty:resize', 'pty-1', 80, 24)
  })

  it('kill invokes pty:kill', async () => {
    await ptyApi.kill('pty-1')
    expect(mockInvoke).toHaveBeenCalledWith('pty:kill', 'pty-1')
  })

  describe('onData', () => {
    it('registers event listener on pty:data:${id}', () => {
      const callback = vi.fn()
      ptyApi.onData('pty-1', callback)
      expect(mockOn).toHaveBeenCalledWith('pty:data:pty-1', expect.any(Function))
    })

    it('returns a cleanup function that removes the listener', () => {
      const callback = vi.fn()
      const cleanup = ptyApi.onData('pty-1', callback)
      cleanup()
      expect(mockRemoveListener).toHaveBeenCalledWith('pty:data:pty-1', expect.any(Function))
    })

    it('forwards data to the callback', () => {
      const callback = vi.fn()
      ptyApi.onData('pty-1', callback)
      const handler = mockOn.mock.calls[0][1]
      handler({}, 'terminal data')
      expect(callback).toHaveBeenCalledWith('terminal data')
    })
  })

  describe('onExit', () => {
    it('registers event listener on pty:exit:${id}', () => {
      const callback = vi.fn()
      ptyApi.onExit('pty-1', callback)
      expect(mockOn).toHaveBeenCalledWith('pty:exit:pty-1', expect.any(Function))
    })

    it('returns a cleanup function that removes the listener', () => {
      const callback = vi.fn()
      const cleanup = ptyApi.onExit('pty-1', callback)
      cleanup()
      expect(mockRemoveListener).toHaveBeenCalledWith('pty:exit:pty-1', expect.any(Function))
    })

    it('forwards exit code to the callback', () => {
      const callback = vi.fn()
      ptyApi.onExit('pty-1', callback)
      const handler = mockOn.mock.calls[0][1]
      handler({}, 0)
      expect(callback).toHaveBeenCalledWith(0)
    })
  })
})
