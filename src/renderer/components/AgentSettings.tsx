/**
 * Agent and repository configuration panel rendered as a global settings overlay.
 *
 * Uses stack-based navigation: root screen shows General settings + nav rows,
 * agents screen shows agent CRUD, repo screen shows per-repo settings + commands link.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAgentStore, type AgentConfig } from '../store/agents'
import { useRepoStore } from '../store/repos'
import { useSessionStore } from '../store/sessions'
import type { EnvVarEditorRef } from './EnvVarEditor'
import { AgentSettingsAgentTab } from './AgentSettingsAgentTab'
import { SettingsRootScreen } from './SettingsRootScreen'
import { SettingsRepoScreen } from './SettingsRepoScreen'
import { PANEL_IDS } from '../panels/types'
import type { ShellOption } from '../../preload/apis/types'

type SettingsScreen =
  | { type: 'root' }
  | { type: 'agents' }
  | { type: 'repo'; repoId: string }

interface AgentSettingsProps {
  onClose: () => void
}

function useAgentForm(addAgent: ReturnType<typeof useAgentStore.getState>['addAgent'], updateAgent: ReturnType<typeof useAgentStore.getState>['updateAgent'], removeAgent: ReturnType<typeof useAgentStore.getState>['removeAgent']) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [color, setColor] = useState('')
  const [env, setEnv] = useState<Record<string, string>>({})
  const [skipApprovalFlag, setSkipApprovalFlag] = useState('')
  const [resumeCommand, setResumeCommand] = useState('')
  const envEditorRef = useRef<EnvVarEditorRef>(null)

  const resetForm = useCallback(() => {
    setName(''); setCommand(''); setColor(''); setEnv({})
    setSkipApprovalFlag(''); setResumeCommand('')
    setShowAddForm(false); setEditingId(null)
  }, [])

  const handleAdd = () => {
    if (!name.trim() || !command.trim()) return
    const finalEnv = envEditorRef.current?.getPendingEnv() ?? env
    addAgent({
      name: name.trim(), command: command.trim(), color: color.trim() || undefined,
      env: Object.keys(finalEnv).length > 0 ? finalEnv : undefined,
      skipApprovalFlag: skipApprovalFlag.trim() || undefined,
      resumeCommand: resumeCommand.trim() || undefined,
    })
    resetForm()
  }

  const handleEdit = (agent: AgentConfig) => {
    setEditingId(agent.id); setName(agent.name); setCommand(agent.command)
    setColor(agent.color || ''); setEnv(agent.env || {})
    setSkipApprovalFlag(agent.skipApprovalFlag || '')
    setResumeCommand(agent.resumeCommand || ''); setShowAddForm(false)
  }

  const handleUpdate = () => {
    if (!editingId || !name.trim() || !command.trim()) return
    const finalEnv = envEditorRef.current?.getPendingEnv() ?? env
    updateAgent(editingId, {
      name: name.trim(), command: command.trim(), color: color.trim() || undefined,
      env: Object.keys(finalEnv).length > 0 ? finalEnv : undefined,
      skipApprovalFlag: skipApprovalFlag.trim() || undefined,
      resumeCommand: resumeCommand.trim() || undefined,
    })
    resetForm()
  }

  const handleDelete = (id: string) => {
    removeAgent(id)
    if (editingId === id) resetForm()
  }

  return {
    editingId, showAddForm, name, command, color, env, skipApprovalFlag, resumeCommand, envEditorRef,
    setName, setCommand, setColor, setEnv, setSkipApprovalFlag, setResumeCommand,
    setShowAddForm, resetForm, handleAdd, handleEdit, handleUpdate, handleDelete,
  }
}

export default function AgentSettings({ onClose }: AgentSettingsProps) {
  const { agents, addAgent, updateAgent, removeAgent } = useAgentStore()
  const { repos, loadRepos, updateRepo, defaultCloneDir, setDefaultCloneDir, defaultShell, setDefaultShell } = useRepoStore()
  const [navStack, setNavStack] = useState<SettingsScreen[]>([{ type: 'root' }])
  const [availableShells, setAvailableShells] = useState<ShellOption[]>([])

  const currentScreen = navStack[navStack.length - 1]
  const pushScreen = useCallback((screen: SettingsScreen) => {
    setNavStack((prev) => [...prev, screen])
  }, [])
  const popScreen = useCallback(() => {
    setNavStack((prev) => prev.length > 1 ? prev.slice(0, -1) : prev)
  }, [])

  useEffect(() => {
    void loadRepos()
    void window.shell.listShells().then(setAvailableShells)
  }, [loadRepos])

  const form = useAgentForm(addAgent, updateAgent, removeAgent)

  // Reset agent form when navigating away from agents screen
  useEffect(() => {
    if (currentScreen.type !== 'agents') form.resetForm()
  }, [currentScreen.type, form.resetForm])

  const handleOpenCommandsEditor = (directory: string) => {
    const { activeSessionId, openCommandsEditor, toggleGlobalPanel } = useSessionStore.getState()
    if (activeSessionId) openCommandsEditor(activeSessionId, directory)
    toggleGlobalPanel(PANEL_IDS.SETTINGS)
  }

  const headerTitle = currentScreen.type === 'root' ? 'Settings'
    : currentScreen.type === 'agents' ? 'Agents'
    : repos.find((r) => r.id === (currentScreen as { repoId: string }).repoId)?.name ?? 'Repository'

  return (
    <div className="h-full flex flex-col bg-bg-secondary">
      <SettingsHeader title={headerTitle} showBack={navStack.length > 1} onBack={popScreen} onClose={onClose} />
      <div className="flex-1 overflow-y-auto p-4">
        {currentScreen.type === 'root' && (
          <SettingsRootScreen
            defaultCloneDir={defaultCloneDir} defaultShell={defaultShell}
            availableShells={availableShells} agents={agents} repos={repos}
            onSetDefaultCloneDir={setDefaultCloneDir} onSetDefaultShell={setDefaultShell}
            onNavigateToAgents={() => pushScreen({ type: 'agents' })}
            onNavigateToRepo={(repoId) => pushScreen({ type: 'repo', repoId })}
          />
        )}
        {currentScreen.type === 'agents' && (
          <AgentSettingsAgentTab
            agents={agents} editingId={form.editingId} showAddForm={form.showAddForm}
            name={form.name} command={form.command} color={form.color} env={form.env}
            skipApprovalFlag={form.skipApprovalFlag} resumeCommand={form.resumeCommand}
            envEditorRef={form.envEditorRef}
            onNameChange={form.setName} onCommandChange={form.setCommand}
            onColorChange={form.setColor} onEnvChange={form.setEnv}
            onSkipApprovalFlagChange={form.setSkipApprovalFlag}
            onResumeCommandChange={form.setResumeCommand}
            onEdit={form.handleEdit} onUpdate={form.handleUpdate}
            onDelete={form.handleDelete} onAdd={form.handleAdd}
            onShowAddForm={() => form.setShowAddForm(true)} onCancel={form.resetForm}
          />
        )}
        {currentScreen.type === 'repo' && (() => {
          const repo = repos.find((r) => r.id === currentScreen.repoId)
          if (!repo) return null
          return (
            <SettingsRepoScreen
              repo={repo} agents={agents}
              onUpdateRepo={updateRepo} onOpenCommandsEditor={handleOpenCommandsEditor}
            />
          )
        })()}
      </div>
    </div>
  )
}

function SettingsHeader({ title, showBack, onBack, onClose }: {
  title: string; showBack: boolean; onBack: () => void; onClose: () => void
}) {
  return (
    <div className="flex items-center justify-between p-4 border-b border-border">
      <div className="flex items-center gap-2">
        {showBack && (
          <button onClick={onBack} className="p-1 text-text-secondary hover:text-text-primary transition-colors" title="Back" data-testid="settings-back">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
        <h2 className="text-lg font-medium text-text-primary">{title}</h2>
      </div>
      <button onClick={onClose} className="p-1 text-text-secondary hover:text-text-primary transition-colors" title="Close settings">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6L6 18" />
          <path d="M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
