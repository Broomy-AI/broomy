/**
 * Visual editor for commands.json files — two-column layout with User/Project tabs.
 *
 * Left column: list of commands for the active tab.
 * Right column: detail editor for the selected command.
 * Header: User (~/.broomy) | Project (.broomy/) tabs + Save button.
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import type { ActionDefinition, CommandsConfig } from '../../features/commands/commandsConfig'
import {
  loadConfigFromPath,
  projectCommandsConfigPath,
  CURRENT_CONFIG_VERSION,
  DEFAULT_STAGE,
  discoverStages,
} from '../../features/commands/commandsConfig'
import { getUserCommandsConfigPath, userCommandsDir } from '../../features/commands/userConfigPath'
import { parseTemplate } from '../../features/commands/templateParser'
import { ShowWhenPicker } from '../../shared/components/ShowWhenPicker'
import { DialogErrorBanner } from '../../shared/components/ErrorBanner'
import { Field, StageChips, EmptyPane, DeleteButton, UnsavedChangesModal, CommandExpandedEditor, ArgsTable, NewStageModal } from './CommandsEditorParts'

type Tab = 'user' | 'project'

interface CommandsEditorProps {
  directory: string
  onClose: () => void
}

const STYLE_OPTIONS = ['primary', 'secondary', 'accent', 'danger'] as const
const SURFACE_OPTIONS = [
  { value: 'source-control', label: 'Source Control' },
  { value: 'review', label: 'Review' },
] as const
const SWITCH_TAB_OPTIONS = [
  { value: '', label: '(none)' },
  { value: 'source-control', label: 'Source Control' },
  { value: 'files', label: 'Files' },
  { value: 'search', label: 'Search' },
  { value: 'recent', label: 'Recent Files' },
  { value: 'review', label: 'Review' },
] as const

function newAction(): ActionDefinition {
  return { id: `action-${Date.now()}`, label: 'New action', template: '/' }
}

function normalizeSurface(s: string | string[] | undefined): string[] {
  if (!s) return ['source-control']
  return Array.isArray(s) ? s : [s]
}

function slashSubtitle(template: string): string | null {
  if (template.includes('\n')) return null
  if (!template.startsWith('/')) return null
  return template.split(/\s+/)[0]
}

export function CommandsEditor({ directory, onClose }: CommandsEditorProps) {
  const [tab, setTab] = useState<Tab>('user')
  const [userActions, setUserActions] = useState<ActionDefinition[] | null>(null)
  const [projectActions, setProjectActions] = useState<ActionDefinition[] | null>(null)
  const [userPath, setUserPath] = useState<string>('')
  const [_userExists, setUserExists] = useState<boolean | null>(null)
  const [_projectExists, setProjectExists] = useState<boolean | null>(null)
  const [userDirty, setUserDirty] = useState(false)
  const [projectDirty, setProjectDirty] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [pendingTabSwitch, setPendingTabSwitch] = useState<Tab | null>(null)

  const projectPath = projectCommandsConfigPath(directory)

  const load = useCallback(async () => {
    const up = await getUserCommandsConfigPath()
    setUserPath(up)
    const u = await loadConfigFromPath(up)
    const p = await loadConfigFromPath(projectPath)
    if (u === null) { setUserActions(null); setUserExists(false) }
    else if (!u.ok) { setUserActions(null); setUserExists(true); setLoadError(u.error) }
    else { setUserActions(u.config.actions); setUserExists(true) }
    if (p === null) { setProjectActions(null); setProjectExists(false) }
    else if (!p.ok) { setProjectActions(null); setProjectExists(true); setLoadError(p.error) }
    else { setProjectActions(p.config.actions); setProjectExists(true) }
    setUserDirty(false); setProjectDirty(false)
  }, [projectPath])

  useEffect(() => { void load() }, [load])

  const actions = tab === 'user' ? userActions : projectActions
  const setActions = tab === 'user' ? setUserActions : setProjectActions
  const setDirty = tab === 'user' ? setUserDirty : setProjectDirty
  const dirty = tab === 'user' ? userDirty : projectDirty

  const selected = useMemo(() => actions?.find(a => a.id === selectedId) ?? null, [actions, selectedId])
  const stageOptions = useMemo(() => discoverStages(actions ?? [], DEFAULT_STAGE), [actions])

  function updateSelected(patch: Partial<ActionDefinition>) {
    if (!selected || !actions) return
    setActions(actions.map(a => a.id === selected.id ? { ...a, ...patch } : a))
    setDirty(true)
  }

  function addAction() {
    const a = newAction()
    setActions([...(actions ?? []), a])
    setSelectedId(a.id)
    setDirty(true)
  }

  function deleteSelected() {
    if (!selected || !actions) return
    setActions(actions.filter(a => a.id !== selected.id))
    setSelectedId(null)
    setDirty(true)
  }

  function switchTab(next: Tab) {
    if (dirty) {
      setPendingTabSwitch(next)
      return
    }
    setTab(next)
    setSelectedId(null)
  }

  async function confirmTabSwitchSave() {
    await save()
    const next = pendingTabSwitch!
    setPendingTabSwitch(null)
    setTab(next)
    setSelectedId(null)
  }

  function confirmTabSwitchDiscard() {
    const next = pendingTabSwitch!
    setPendingTabSwitch(null)
    setTab(next)
    setSelectedId(null)
    void load()
  }

  async function save() {
    setSaving(true)
    try {
      const path = tab === 'user' ? userPath : projectPath
      const dir = tab === 'user'
        ? userCommandsDir(userPath.replace(/\/\.broomy\/commands\.json$/, ''))
        : `${directory}/.broomy`
      await window.fs.mkdir(dir)
      const pruned = (actions ?? []).map(action => {
        if (!action.args || action.args.length === 0) return action
        const parsedNames = new Set(parseTemplate(action.template).args.map(a => a.name))
        const filteredArgs = action.args.filter(a => parsedNames.has(a.name))
        return filteredArgs.length === 0
          ? (({ args: _args, ...rest }) => rest)(action)
          : { ...action, args: filteredArgs }
      })
      const config: CommandsConfig = { version: CURRENT_CONFIG_VERSION, actions: pruned }
      await window.fs.writeFile(path, JSON.stringify(config, null, 2))
      if (tab === 'user') { setUserExists(true); setUserDirty(false) }
      else { setProjectExists(true); setProjectDirty(false) }
    } finally {
      setSaving(false)
    }
  }

  async function addProjectFile() {
    setProjectActions([])
    setProjectDirty(true)
    setProjectExists(true)
    await window.fs.mkdir(`${directory}/.broomy`)
  }

  return (
    <div className="h-full flex flex-col">
      <EditorHeader tab={tab} setTab={switchTab} dirty={dirty} onClose={onClose} onSave={save} saving={saving} />

      {loadError && (
        <div className="p-3">
          <DialogErrorBanner error={loadError} onDismiss={() => setLoadError(null)} />
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        {/* Left column: command list */}
        <div className="w-[280px] border-r border-border bg-bg-secondary flex flex-col">
          {actions === null ? (
            <EmptyPane tab={tab} onAddProjectFile={() => void addProjectFile()} />
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {actions.map(a => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    className={`w-full text-left px-2 py-2 rounded ${selectedId === a.id ? 'bg-bg-tertiary border-l-2 border-accent' : 'hover:bg-bg-tertiary'}`}
                  >
                    <div className="text-sm text-text-primary truncate">{a.label}</div>
                    <div className="text-2xs text-text-tertiary font-mono truncate">
                      {slashSubtitle(a.template) ?? (a.template.includes('\n') ? 'text block' : a.template)}
                    </div>
                  </button>
                ))}
              </div>
              <button
                onClick={addAction}
                className="p-2 m-2 text-sm rounded border border-dashed border-border text-text-secondary hover:text-text-primary"
              >
                + Add command
              </button>
            </>
          )}
        </div>

        {/* Right column: detail editor */}
        <div className="flex-1 overflow-y-auto p-4">
          {actions === null ? (
            <div className="text-sm text-text-secondary">
              {tab === 'user' ? 'Set up your commands using the picker.' : 'No project commands.'}
            </div>
          ) : selected ? (
            <Detail
              selected={selected}
              onUpdate={updateSelected}
              onDelete={deleteSelected}
              stageOptions={stageOptions}
            />
          ) : (
            <div className="text-sm text-text-secondary">
              Select a command to edit, or click + Add command.
            </div>
          )}
        </div>
      </div>

      {pendingTabSwitch && (
        <UnsavedChangesModal
          tabName={tab === 'user' ? 'User' : 'Project'}
          onSave={() => void confirmTabSwitchSave()}
          onDiscard={confirmTabSwitchDiscard}
          onCancel={() => setPendingTabSwitch(null)}
        />
      )}
    </div>
  )
}

function EditorHeader({
  tab, setTab, dirty, onClose, onSave, saving,
}: {
  tab: Tab
  setTab: (t: Tab) => void
  dirty: boolean
  onClose: () => void
  onSave: () => Promise<void>
  saving: boolean
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-bg-secondary">
      <div role="tablist" className="flex gap-1">
        <button
          role="tab"
          aria-selected={tab === 'user'}
          onClick={() => setTab('user')}
          className={`px-3 py-1 text-sm rounded ${tab === 'user' ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary'}`}
        >
          User (~/.broomy)
        </button>
        <button
          role="tab"
          aria-selected={tab === 'project'}
          onClick={() => setTab('project')}
          className={`px-3 py-1 text-sm rounded ${tab === 'project' ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary'}`}
        >
          Project (.broomy/)
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => void onSave()}
          disabled={!dirty || saving}
          className="px-3 py-1 text-sm rounded bg-accent text-on-accent hover:bg-accent/80 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {dirty && <span className="w-2 h-2 rounded-full bg-accent" />}
        <button
          onClick={onClose}
          className="text-text-secondary hover:text-text-primary px-1"
          data-testid="close-commands-editor"
        >
          ✕
        </button>
      </div>
    </div>
  )
}


function Detail({
  selected, onUpdate, onDelete, stageOptions,
}: {
  selected: ActionDefinition
  onUpdate: (patch: Partial<ActionDefinition>) => void
  onDelete: () => void
  stageOptions: string[]
}) {
  const parsed = parseTemplate(selected.template)
  const argsMeta = selected.args ?? []
  const mode: 'one-line' | 'block' = selected.template.includes('\n') ? 'block' : 'one-line'
  const [commandExpanded, setCommandExpanded] = useState(false)
  const [addingSetStage, setAddingSetStage] = useState(false)

  function updateArgMeta(name: string, patch: Partial<{ description: string; multiline: boolean }>) {
    const existing = argsMeta.find(a => a.name === name)
    const next = existing
      ? argsMeta.map(a => a.name === name ? { ...a, ...patch } : a)
      : [...argsMeta, { name, ...patch }]
    onUpdate({ args: next })
  }

  return (
    <div className="space-y-3 max-w-2xl">
      <Field label="Label">
        <input
          type="text"
          value={selected.label}
          onChange={e => onUpdate({ label: e.target.value })}
          className="w-full px-2 py-1.5 text-sm rounded border border-border bg-bg-secondary text-text-primary focus:outline-none focus:border-accent"
        />
      </Field>

      <Field label="Description" hint="Shown as a tooltip and in the arg dialog.">
        <input
          type="text"
          value={selected.description ?? ''}
          onChange={e => onUpdate({ description: e.target.value || undefined })}
          className="w-full px-2 py-1.5 text-sm rounded border border-border bg-bg-secondary text-text-primary focus:outline-none focus:border-accent"
        />
      </Field>

      <Field
        label="Command"
        hint={
          mode === 'one-line'
            ? 'Use {name} for args; --flag {name} makes the arg optional.'
            : 'Text-block mode.'
        }
        action={
          <button
            type="button"
            onClick={() => setCommandExpanded(true)}
            className="text-2xs text-text-tertiary hover:text-text-primary transition-colors"
            title="Edit in a larger pane"
            data-testid="expand-command"
          >
            ⤢ Expand
          </button>
        }
      >
        {mode === 'one-line' ? (
          <input
            type="text"
            value={selected.template}
            onChange={e => onUpdate({ template: e.target.value })}
            className="w-full px-2 py-1.5 text-sm font-mono rounded border border-border bg-bg-secondary text-text-primary focus:outline-none focus:border-accent"
          />
        ) : (
          <textarea
            value={selected.template}
            onChange={e => onUpdate({ template: e.target.value })}
            rows={6}
            className="w-full px-2 py-1.5 text-sm font-mono rounded border border-border bg-bg-secondary text-text-primary focus:outline-none focus:border-accent"
          />
        )}
      </Field>

      {commandExpanded && (
        <CommandExpandedEditor
          value={selected.template}
          onChange={(v) => onUpdate({ template: v })}
          onClose={() => setCommandExpanded(false)}
        />
      )}

      {parsed.args.length > 0 && (
        <ArgsTable parsedArgs={parsed.args} argsMeta={argsMeta} updateArgMeta={updateArgMeta} />
      )}

      <Field label="Show when">
        <ShowWhenPicker showWhen={selected.showWhen ?? []} onChange={s => onUpdate({ showWhen: s })} />
      </Field>

      <Field label="Stages" hint="Show this command only in these stages (leave empty for any).">
        <StageChips
          selected={selected.stages ?? []}
          options={stageOptions}
          onChange={v => onUpdate({ stages: v.length === 0 ? undefined : v })}
        />
      </Field>

      <Field label="Set stage" hint="Stage to write after running.">
        <select
          value={selected.setStage === null ? '__null' : (selected.setStage ?? '__none')}
          onChange={e => {
            const v = e.target.value
            if (v === '__none') { onUpdate({ setStage: undefined }); return }
            if (v === '__null') { onUpdate({ setStage: null }); return }
            if (v === '__new') { setAddingSetStage(true); return }
            onUpdate({ setStage: v })
          }}
          className="w-full px-2 py-1.5 text-sm rounded border border-border bg-bg-secondary"
        >
          <option value="__none">(no change)</option>
          <option value="__null">reset to &quot;{DEFAULT_STAGE}&quot;</option>
          {stageOptions.filter(s => s !== DEFAULT_STAGE).map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
          <option value="__new">+ New stage…</option>
        </select>
      </Field>

      {addingSetStage && (
        <NewStageModal
          title="New stage for setStage"
          onCancel={() => setAddingSetStage(false)}
          onSubmit={(name) => { onUpdate({ setStage: name.trim() }); setAddingSetStage(false) }}
        />
      )}

      <Field label="Style">
        <select
          value={selected.style ?? 'secondary'}
          onChange={e => onUpdate({ style: e.target.value as ActionDefinition['style'] })}
          className="w-full px-2 py-1.5 text-sm rounded border border-border bg-bg-secondary"
        >
          {STYLE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>

      <Field label="Surface">
        <div className="flex gap-2 text-sm">
          {SURFACE_OPTIONS.map(opt => {
            const surfaces = normalizeSurface(selected.surface)
            const checked = surfaces.includes(opt.value)
            return (
              <label key={opt.value} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = checked
                      ? surfaces.filter(s => s !== opt.value)
                      : [...surfaces, opt.value]
                    onUpdate({
                      surface: next.length === 0 ? undefined : next.length === 1 ? next[0] : next,
                    })
                  }}
                  className="accent-accent"
                />
                {opt.label}
              </label>
            )
          })}
        </div>
      </Field>

      <Field label="Switch tab">
        <select
          value={selected.switchTab ?? ''}
          onChange={e => onUpdate({ switchTab: e.target.value || undefined })}
          className="w-full px-2 py-1.5 text-sm rounded border border-border bg-bg-secondary"
        >
          {SWITCH_TAB_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </Field>

      <DeleteButton id={selected.id} onDelete={onDelete} />
    </div>
  )
}

