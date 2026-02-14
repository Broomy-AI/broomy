import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInvoke = vi.fn()
vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: (...args: unknown[]) => mockInvoke(...args),
  },
}))

import { configApi, profilesApi, agentsApi, reposApi } from './config'

describe('preload config API', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockInvoke.mockResolvedValue(undefined)
  })

  describe('configApi', () => {
    it('load invokes config:load with profileId', async () => {
      await configApi.load('profile-1')
      expect(mockInvoke).toHaveBeenCalledWith('config:load', 'profile-1')
    })

    it('load invokes config:load without profileId', async () => {
      await configApi.load()
      expect(mockInvoke).toHaveBeenCalledWith('config:load', undefined)
    })

    it('save invokes config:save with config data', async () => {
      const config = { agents: [], sessions: [] }
      await configApi.save(config as any)
      expect(mockInvoke).toHaveBeenCalledWith('config:save', config)
    })
  })

  describe('profilesApi', () => {
    it('list invokes profiles:list', async () => {
      await profilesApi.list()
      expect(mockInvoke).toHaveBeenCalledWith('profiles:list')
    })

    it('save invokes profiles:save', async () => {
      const data = { profiles: [], lastProfileId: 'default' }
      await profilesApi.save(data)
      expect(mockInvoke).toHaveBeenCalledWith('profiles:save', data)
    })

    it('openWindow invokes profiles:openWindow', async () => {
      await profilesApi.openWindow('profile-1')
      expect(mockInvoke).toHaveBeenCalledWith('profiles:openWindow', 'profile-1')
    })

    it('getOpenProfiles invokes profiles:getOpenProfiles', async () => {
      await profilesApi.getOpenProfiles()
      expect(mockInvoke).toHaveBeenCalledWith('profiles:getOpenProfiles')
    })
  })

  describe('agentsApi', () => {
    it('isInstalled invokes agent:isInstalled', async () => {
      await agentsApi.isInstalled('claude')
      expect(mockInvoke).toHaveBeenCalledWith('agent:isInstalled', 'claude')
    })
  })

  describe('reposApi', () => {
    it('getInitScript invokes repos:getInitScript', async () => {
      await reposApi.getInitScript('repo-1', 'profile-1')
      expect(mockInvoke).toHaveBeenCalledWith('repos:getInitScript', 'repo-1', 'profile-1')
    })

    it('saveInitScript invokes repos:saveInitScript', async () => {
      await reposApi.saveInitScript('repo-1', 'echo hi', 'profile-1')
      expect(mockInvoke).toHaveBeenCalledWith('repos:saveInitScript', 'repo-1', 'echo hi', 'profile-1')
    })
  })
})
