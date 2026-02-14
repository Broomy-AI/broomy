import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInvoke = vi.fn()
vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: (...args: unknown[]) => mockInvoke(...args),
  },
}))

import { menuApi, tsApi } from './menu'

describe('preload menu API', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockInvoke.mockResolvedValue(undefined)
  })

  describe('menuApi', () => {
    it('popup invokes menu:popup with items', async () => {
      const items = [{ id: 'cut', label: 'Cut' }]
      await menuApi.popup(items)
      expect(mockInvoke).toHaveBeenCalledWith('menu:popup', items)
    })
  })

  describe('tsApi', () => {
    it('getProjectContext invokes ts:getProjectContext', async () => {
      await tsApi.getProjectContext('/project')
      expect(mockInvoke).toHaveBeenCalledWith('ts:getProjectContext', '/project')
    })
  })
})
