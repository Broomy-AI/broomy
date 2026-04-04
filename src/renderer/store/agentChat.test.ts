import { describe, it, expect, beforeEach } from 'vitest'
import { useAgentChatStore } from './agentChat'
import type { AgentSdkMessage, AgentSdkPermissionRequest } from '../../shared/agentSdkTypes'

function makeMsg(overrides: Partial<AgentSdkMessage> & { id: string }): AgentSdkMessage {
  return { type: 'text', timestamp: Date.now(), text: 'hello', ...overrides }
}

describe('useAgentChatStore', () => {
  beforeEach(() => {
    useAgentChatStore.setState({ sessions: {} })
  })

  describe('getSession', () => {
    it('returns default session for unknown id', () => {
      const session = useAgentChatStore.getState().getSession('unknown')
      expect(session.messages).toEqual([])
      expect(session.state).toBe('idle')
      expect(session.pendingPermission).toBeNull()
      expect(session.error).toBeNull()
    })

    it('returns existing session', () => {
      useAgentChatStore.getState().addMessage('s1', makeMsg({ id: 'msg-1' }))
      const session = useAgentChatStore.getState().getSession('s1')
      expect(session.messages).toHaveLength(1)
    })
  })

  describe('addMessage', () => {
    it('adds a message to a new session', () => {
      useAgentChatStore.getState().addMessage('s1', makeMsg({ id: 'msg-1' }))
      const session = useAgentChatStore.getState().getSession('s1')
      expect(session.messages).toHaveLength(1)
      expect(session.messages[0].id).toBe('msg-1')
    })

    it('appends to existing messages', () => {
      useAgentChatStore.getState().addMessage('s1', makeMsg({ id: 'msg-1' }))
      useAgentChatStore.getState().addMessage('s1', makeMsg({ id: 'msg-2' }))
      expect(useAgentChatStore.getState().getSession('s1').messages).toHaveLength(2)
    })

    it('deduplicates by message ID', () => {
      useAgentChatStore.getState().addMessage('s1', makeMsg({ id: 'msg-1' }))
      useAgentChatStore.getState().addMessage('s1', makeMsg({ id: 'msg-1' }))
      expect(useAgentChatStore.getState().getSession('s1').messages).toHaveLength(1)
    })
  })

  describe('setState', () => {
    it('sets state on a new session', () => {
      useAgentChatStore.getState().setState('s1', 'running')
      expect(useAgentChatStore.getState().getSession('s1').state).toBe('running')
    })

    it('updates state on existing session', () => {
      useAgentChatStore.getState().addMessage('s1', makeMsg({ id: 'msg-1' }))
      useAgentChatStore.getState().setState('s1', 'running')
      const session = useAgentChatStore.getState().getSession('s1')
      expect(session.state).toBe('running')
      expect(session.messages).toHaveLength(1)
    })
  })

  describe('setPendingPermission', () => {
    it('sets permission and switches state to awaiting_permission', () => {
      const req: AgentSdkPermissionRequest = {
        id: 'perm-1', toolName: 'Bash', toolInput: { command: 'ls' }, toolUseId: 'tu-1',
      }
      useAgentChatStore.getState().setPendingPermission('s1', req)
      const session = useAgentChatStore.getState().getSession('s1')
      expect(session.pendingPermission).toEqual(req)
      expect(session.state).toBe('awaiting_permission')
    })

    it('clears permission without changing state', () => {
      useAgentChatStore.getState().setState('s1', 'running')
      useAgentChatStore.getState().setPendingPermission('s1', null)
      const session = useAgentChatStore.getState().getSession('s1')
      expect(session.pendingPermission).toBeNull()
      expect(session.state).toBe('running')
    })
  })

  describe('setError', () => {
    it('sets error and switches state to error', () => {
      useAgentChatStore.getState().setError('s1', 'something broke')
      const session = useAgentChatStore.getState().getSession('s1')
      expect(session.error).toBe('something broke')
      expect(session.state).toBe('error')
    })

    it('clears error without changing state', () => {
      useAgentChatStore.getState().setState('s1', 'running')
      useAgentChatStore.getState().setError('s1', null)
      const session = useAgentChatStore.getState().getSession('s1')
      expect(session.error).toBeNull()
      expect(session.state).toBe('running')
    })
  })

  describe('clearSession', () => {
    it('removes the session', () => {
      useAgentChatStore.getState().addMessage('s1', makeMsg({ id: 'msg-1' }))
      useAgentChatStore.getState().clearSession('s1')
      expect(useAgentChatStore.getState().sessions).not.toHaveProperty('s1')
    })

    it('does not affect other sessions', () => {
      useAgentChatStore.getState().addMessage('s1', makeMsg({ id: 'msg-1' }))
      useAgentChatStore.getState().addMessage('s2', makeMsg({ id: 'msg-2' }))
      useAgentChatStore.getState().clearSession('s1')
      expect(useAgentChatStore.getState().getSession('s2').messages).toHaveLength(1)
    })
  })

  describe('replaceMessages', () => {
    it('replaces messages in an existing session', () => {
      useAgentChatStore.getState().addMessage('s1', makeMsg({ id: 'msg-1', text: 'old' }))
      useAgentChatStore.getState().addMessage('s1', makeMsg({ id: 'msg-2', text: 'old2' }))
      const newMsgs = [makeMsg({ id: 'new-1', text: 'new' })]
      useAgentChatStore.getState().replaceMessages('s1', newMsgs)
      const session = useAgentChatStore.getState().getSession('s1')
      expect(session.messages).toHaveLength(1)
      expect(session.messages[0].text).toBe('new')
    })

    it('creates a session if it does not exist', () => {
      const msgs = [makeMsg({ id: 'a' }), makeMsg({ id: 'b' })]
      useAgentChatStore.getState().replaceMessages('s1', msgs)
      expect(useAgentChatStore.getState().getSession('s1').messages).toHaveLength(2)
    })

    it('preserves other session state', () => {
      useAgentChatStore.getState().setState('s1', 'running')
      useAgentChatStore.getState().setError('s1', 'some error')
      useAgentChatStore.getState().replaceMessages('s1', [makeMsg({ id: 'x' })])
      const session = useAgentChatStore.getState().getSession('s1')
      expect(session.messages).toHaveLength(1)
      // replaceMessages preserves state/error — it only touches messages
      expect(session.error).toBe('some error')
    })

    it('does not affect other sessions', () => {
      useAgentChatStore.getState().addMessage('s1', makeMsg({ id: 'msg-1' }))
      useAgentChatStore.getState().addMessage('s2', makeMsg({ id: 'msg-2' }))
      useAgentChatStore.getState().replaceMessages('s1', [])
      expect(useAgentChatStore.getState().getSession('s2').messages).toHaveLength(1)
    })
  })
})
