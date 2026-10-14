import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from './sessions'
import { useAgentStore } from './agents'
import { useRepoStore } from './repos'
import { profileRuntime, rememberProfile, getSessionProfileConfig } from './profileRuntime'
import { saveNow, setCurrentProfileId, setLoadedCounts } from './configPersistence'

describe('profile tab runtime', () => {
  beforeEach(() => {
    profileRuntime.clear()
    setCurrentProfileId(undefined)
    setLoadedCounts({ sessions: 0, agents: 0, repos: 0 })
    useSessionStore.setState({ sessions: [], runtimeProfileId: undefined, activeSessionId: null })
    useAgentStore.setState({ agents: [], profileId: undefined })
    useRepoStore.setState({ repos: [], profileId: undefined })
    vi.mocked(window.config.load).mockImplementation(async (profileId) => ({
      agents: [{ id: 'shared-agent', name: profileId ?? '', command: profileId ?? '' }],
      sessions: [{ id: `${profileId}-session`, name: profileId ?? '', directory: `/${profileId}`, agentId: 'shared-agent' }],
      repos: [],
    }))
    vi.mocked(window.config.save).mockResolvedValue({ success: true })
    vi.mocked(window.git.getBranch).mockResolvedValue('main')
  })

  async function load(id: string) {
    await useAgentStore.getState().loadAgents(id)
    await useRepoStore.getState().loadRepos(id)
    await useSessionStore.getState().loadSessions(id)
  }

  it('retains running sessions and background changes on a round trip', async () => {
    await load('a')
    useSessionStore.getState().resumeSession('a-session')
    useSessionStore.getState().setAgentPtyId('a-session', 'live-pty')
    rememberProfile('a')
    await load('b')
    expect(getSessionProfileConfig('a')?.agents.agents[0].command).toBe('a')
    useSessionStore.getState().updateAgentMonitor('a-session', { status: 'working', lastMessage: 'background output' })
    useSessionStore.getState().setSdkSessionId('a-session', 'sdk-resume')
    rememberProfile('b')
    vi.mocked(window.config.load).mockClear()
    await load('a')
    expect(window.config.load).not.toHaveBeenCalled()
    expect(useSessionStore.getState().activeSessionId).toBe('a-session')
    expect(useSessionStore.getState().sessions.find(s => s.id === 'a-session')).toMatchObject({
      isPaused: false, agentPtyId: 'live-pty', status: 'working', lastMessage: 'background output', sdkSessionId: 'sdk-resume',
    })
    expect(useAgentStore.getState().agents[0].command).toBe('a')
  })

  it('saves background SDK changes to their owning profile', async () => {
    await load('a')
    rememberProfile('a')
    await load('b')
    useSessionStore.getState().setSdkSessionId('a-session', 'background-sdk')
    vi.mocked(window.config.save).mockClear()
    await saveNow()
    const saves = vi.mocked(window.config.save).mock.calls.map(([config]) => config)
    expect(saves.find(c => c.profileId === 'a')).toMatchObject({
      agents: [{ command: 'a' }], sessions: [{ id: 'a-session', sdkSessionId: 'background-sdk' }],
    })
    expect(saves.find(c => c.profileId === 'b')?.sessions.map(s => s.id)).toEqual(['b-session'])
  })

  it('reports a failed save so switching can stop before replacing profile state', async () => {
    await load('a')
    vi.mocked(window.config.save).mockResolvedValue({ success: false, error: 'disk unavailable' })
    await expect(saveNow()).rejects.toThrow('disk unavailable')
    expect(useSessionStore.getState().runtimeProfileId).toBe('a')
  })

  it('does not select another profile when the current last session is removed or archived', async () => {
    await load('a')
    rememberProfile('a')
    await load('b')
    useSessionStore.getState().archiveSession('b-session')
    expect(useSessionStore.getState().activeSessionId).toBeNull()
    useSessionStore.getState().setActiveSession('b-session')
    useSessionStore.getState().removeSession('b-session')
    expect(useSessionStore.getState().activeSessionId).toBeNull()
    expect(useSessionStore.getState().sessions.map(s => s.id)).toEqual(['a-session'])
  })
})
