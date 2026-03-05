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

import { shellApi, dialogApi, appApi, windowControlsApi, updateApi } from './shell'

describe('preload shell API', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockOn.mockReset()
    mockRemoveListener.mockReset()
    mockInvoke.mockResolvedValue(undefined)
  })

  describe('shellApi', () => {
    it('exec invokes shell:exec', async () => {
      await shellApi.exec('ls', '/test')
      expect(mockInvoke).toHaveBeenCalledWith('shell:exec', 'ls', '/test')
    })

    it('openExternal invokes shell:openExternal', async () => {
      await shellApi.openExternal('https://example.com')
      expect(mockInvoke).toHaveBeenCalledWith('shell:openExternal', 'https://example.com')
    })

    it('listShells invokes shells:list', async () => {
      await shellApi.listShells()
      expect(mockInvoke).toHaveBeenCalledWith('shells:list')
    })
  })

  describe('dialogApi', () => {
    it('openFolder invokes dialog:openFolder', async () => {
      await dialogApi.openFolder()
      expect(mockInvoke).toHaveBeenCalledWith('dialog:openFolder')
    })
  })

  describe('appApi', () => {
    it('isDev invokes app:isDev', async () => {
      await appApi.isDev()
      expect(mockInvoke).toHaveBeenCalledWith('app:isDev')
    })

    it('homedir invokes app:homedir', async () => {
      await appApi.homedir()
      expect(mockInvoke).toHaveBeenCalledWith('app:homedir')
    })

    it('platform invokes app:platform', async () => {
      await appApi.platform()
      expect(mockInvoke).toHaveBeenCalledWith('app:platform')
    })

    it('tmpdir invokes app:tmpdir', async () => {
      await appApi.tmpdir()
      expect(mockInvoke).toHaveBeenCalledWith('app:tmpdir')
    })
  })

  describe('appApi extended', () => {
    it('getVersion invokes app:getVersion', async () => {
      await appApi.getVersion()
      expect(mockInvoke).toHaveBeenCalledWith('app:getVersion')
    })

    it('getCrashLog invokes app:getCrashLog', async () => {
      await appApi.getCrashLog()
      expect(mockInvoke).toHaveBeenCalledWith('app:getCrashLog')
    })

    it('dismissCrashLog invokes app:dismissCrashLog', async () => {
      await appApi.dismissCrashLog()
      expect(mockInvoke).toHaveBeenCalledWith('app:dismissCrashLog')
    })

    it('getCrashReportUrl invokes app:getCrashReportUrl', async () => {
      await appApi.getCrashReportUrl()
      expect(mockInvoke).toHaveBeenCalledWith('app:getCrashReportUrl')
    })
  })

  describe('windowControlsApi', () => {
    it('minimize invokes window:minimize', async () => {
      await windowControlsApi.minimize()
      expect(mockInvoke).toHaveBeenCalledWith('window:minimize')
    })

    it('maximize invokes window:maximize', async () => {
      await windowControlsApi.maximize()
      expect(mockInvoke).toHaveBeenCalledWith('window:maximize')
    })

    it('close invokes window:close', async () => {
      await windowControlsApi.close()
      expect(mockInvoke).toHaveBeenCalledWith('window:close')
    })
  })

  describe('updateApi', () => {
    it('checkForUpdates invokes updater:checkForUpdates', async () => {
      await updateApi.checkForUpdates()
      expect(mockInvoke).toHaveBeenCalledWith('updater:checkForUpdates')
    })

    it('downloadUpdate invokes updater:downloadUpdate', async () => {
      await updateApi.downloadUpdate()
      expect(mockInvoke).toHaveBeenCalledWith('updater:downloadUpdate')
    })

    it('installUpdate invokes updater:installUpdate', () => {
      updateApi.installUpdate()
      expect(mockInvoke).toHaveBeenCalledWith('updater:installUpdate')
    })

    it('onDownloadProgress registers and unregisters listener', () => {
      const callback = vi.fn()
      const unsubscribe = updateApi.onDownloadProgress(callback)

      expect(mockOn).toHaveBeenCalledWith('updater:downloadProgress', expect.any(Function))

      // Call the handler
      const handler = mockOn.mock.calls[0][1]
      handler({}, 42)
      expect(callback).toHaveBeenCalledWith(42)

      // Unsubscribe
      unsubscribe()
      expect(mockRemoveListener).toHaveBeenCalledWith('updater:downloadProgress', handler)
    })

    it('onUpdateDownloaded registers and unregisters listener', () => {
      const callback = vi.fn()
      const unsubscribe = updateApi.onUpdateDownloaded(callback)

      expect(mockOn).toHaveBeenCalledWith('updater:updateDownloaded', expect.any(Function))

      const handler = mockOn.mock.calls[0][1]
      handler()
      expect(callback).toHaveBeenCalled()

      unsubscribe()
      expect(mockRemoveListener).toHaveBeenCalledWith('updater:updateDownloaded', handler)
    })

    it('onUpdateAvailable registers and unregisters listener', () => {
      const callback = vi.fn()
      const unsubscribe = updateApi.onUpdateAvailable(callback)

      expect(mockOn).toHaveBeenCalledWith('updater:updateAvailable', expect.any(Function))

      const handler = mockOn.mock.calls[0][1]
      handler({}, { version: '1.0.0' })
      expect(callback).toHaveBeenCalledWith({ version: '1.0.0' })

      unsubscribe()
      expect(mockRemoveListener).toHaveBeenCalledWith('updater:updateAvailable', handler)
    })
  })
})
