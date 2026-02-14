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

import { fsApi } from './fs'

describe('preload fs API', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockOn.mockReset()
    mockRemoveListener.mockReset()
    mockInvoke.mockResolvedValue(undefined)
  })

  it('readDir invokes fs:readDir', async () => {
    await fsApi.readDir('/test')
    expect(mockInvoke).toHaveBeenCalledWith('fs:readDir', '/test')
  })

  it('readFile invokes fs:readFile', async () => {
    await fsApi.readFile('/test/file.txt')
    expect(mockInvoke).toHaveBeenCalledWith('fs:readFile', '/test/file.txt')
  })

  it('writeFile invokes fs:writeFile', async () => {
    await fsApi.writeFile('/test/file.txt', 'content')
    expect(mockInvoke).toHaveBeenCalledWith('fs:writeFile', '/test/file.txt', 'content')
  })

  it('appendFile invokes fs:appendFile', async () => {
    await fsApi.appendFile('/test/file.txt', 'data')
    expect(mockInvoke).toHaveBeenCalledWith('fs:appendFile', '/test/file.txt', 'data')
  })

  it('readFileBase64 invokes fs:readFileBase64', async () => {
    await fsApi.readFileBase64('/test/img.png')
    expect(mockInvoke).toHaveBeenCalledWith('fs:readFileBase64', '/test/img.png')
  })

  it('exists invokes fs:exists', async () => {
    await fsApi.exists('/test')
    expect(mockInvoke).toHaveBeenCalledWith('fs:exists', '/test')
  })

  it('mkdir invokes fs:mkdir', async () => {
    await fsApi.mkdir('/test/dir')
    expect(mockInvoke).toHaveBeenCalledWith('fs:mkdir', '/test/dir')
  })

  it('rm invokes fs:rm', async () => {
    await fsApi.rm('/test/file')
    expect(mockInvoke).toHaveBeenCalledWith('fs:rm', '/test/file')
  })

  it('createFile invokes fs:createFile', async () => {
    await fsApi.createFile('/test/new.txt')
    expect(mockInvoke).toHaveBeenCalledWith('fs:createFile', '/test/new.txt')
  })

  it('search invokes fs:search', async () => {
    await fsApi.search('/test', 'query')
    expect(mockInvoke).toHaveBeenCalledWith('fs:search', '/test', 'query')
  })

  it('watch invokes fs:watch', async () => {
    await fsApi.watch('watch-1', '/test')
    expect(mockInvoke).toHaveBeenCalledWith('fs:watch', 'watch-1', '/test')
  })

  it('unwatch invokes fs:unwatch', async () => {
    await fsApi.unwatch('watch-1')
    expect(mockInvoke).toHaveBeenCalledWith('fs:unwatch', 'watch-1')
  })

  describe('onChange', () => {
    it('registers event listener on fs:change:${id}', () => {
      const callback = vi.fn()
      fsApi.onChange('watch-1', callback)
      expect(mockOn).toHaveBeenCalledWith('fs:change:watch-1', expect.any(Function))
    })

    it('returns a cleanup function that removes the listener', () => {
      const callback = vi.fn()
      const cleanup = fsApi.onChange('watch-1', callback)
      cleanup()
      expect(mockRemoveListener).toHaveBeenCalledWith('fs:change:watch-1', expect.any(Function))
    })

    it('forwards events to the callback', () => {
      const callback = vi.fn()
      fsApi.onChange('watch-1', callback)
      const handler = mockOn.mock.calls[0][1]
      const event = { eventType: 'change', filename: 'test.ts' }
      handler({}, event)
      expect(callback).toHaveBeenCalledWith(event)
    })
  })
})
