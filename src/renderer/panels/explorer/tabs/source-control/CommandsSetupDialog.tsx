import { useState, useEffect } from 'react'
import { PACKS } from '../../../../features/commands/packs'
import { getUserCommandsConfigPath, userCommandsDir } from '../../../../features/commands/userConfigPath'
import { CURRENT_CONFIG_VERSION } from '../../../../features/commands/commandsConfig'

interface CommandsSetupDialogProps {
  onClose: () => void
  onInstalled: () => void
}

export function CommandsSetupDialog({ onClose, onInstalled }: CommandsSetupDialogProps) {
  const [selectedId, setSelectedId] = useState<string>(PACKS[0]?.id ?? 'basics')
  const [installing, setInstalling] = useState(false)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [home, setHome] = useState<string>('')
  const [pluginConfirmed, setPluginConfirmed] = useState(false)

  useEffect(() => { void window.app.homedir().then(setHome) }, [])

  const selectedPack = PACKS.find(p => p.id === selectedId)
  const requiresPlugin = selectedPack?.requiresPlugin

  function handleSelectPack(id: string) {
    setSelectedId(id)
    setPluginConfirmed(false)
  }

  async function doInstall() {
    setInstalling(true)
    try {
      const pack = PACKS.find(p => p.id === selectedId)
      if (!pack) return
      const path = await getUserCommandsConfigPath()
      await window.fs.mkdir(userCommandsDir(home))
      const config = { version: CURRENT_CONFIG_VERSION, actions: pack.actions }
      await window.fs.writeFile(path, JSON.stringify(config, null, 2))
      onInstalled()
      onClose()
    } finally {
      setInstalling(false)
    }
  }

  async function onInstallClick() {
    const path = await getUserCommandsConfigPath()
    const exists = await window.fs.exists(path)
    if (exists) {
      setConfirmReplace(true)
      return
    }
    void doInstall()
  }

  const installDisabled = installing || (requiresPlugin !== undefined && !pluginConfirmed)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div role="dialog" className="bg-bg-secondary border border-border rounded-lg shadow-xl w-full max-w-2xl mx-4 p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-medium text-text-primary">Set up commands</h3>
        <p className="text-sm text-text-secondary">Pick a starter set. You can edit anything afterwards.</p>

        <div className="grid grid-cols-3 gap-3">
          {PACKS.map((p, i) => {
            const selected = selectedId === p.id
            return (
              <button
                key={p.id}
                data-testid={`pack-card-${p.id}`}
                onClick={() => handleSelectPack(p.id)}
                className={`text-left p-3 rounded border transition-colors ${selected ? 'border-accent bg-bg-tertiary' : 'border-border bg-bg-primary hover:bg-bg-tertiary'}`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text-primary">{p.name}</span>
                  {i === 0 && <span className="text-[10px] px-1 py-0.5 rounded bg-accent/20 text-accent">Recommended</span>}
                </div>
                <div className="text-xs text-text-secondary mt-1">{p.description}</div>
                {p.requiresPlugin && (
                  <div className="text-[11px] text-text-tertiary mt-1">
                    Requires {p.requiresPlugin.name} —{' '}
                    <a
                      href={p.requiresPlugin.url}
                      className="underline hover:text-text-secondary"
                      onClick={e => {
                        e.stopPropagation()
                        void window.shell.openExternal(p.requiresPlugin!.url)
                      }}
                    >
                      {p.requiresPlugin.url}
                    </a>
                  </div>
                )}
                <div className="text-[11px] text-text-tertiary mt-2">{p.actions.length} commands</div>
              </button>
            )
          })}
        </div>

        {requiresPlugin && (
          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={pluginConfirmed}
              onChange={e => setPluginConfirmed(e.target.checked)}
              data-testid="plugin-confirmed-checkbox"
              className="w-4 h-4"
            />
            I have {requiresPlugin.name} installed
          </label>
        )}

        <p className="text-xs text-text-tertiary">Installs to <code className="font-mono">~/.broomy/commands.json</code></p>

        {confirmReplace && (
          <div className="p-2 rounded border border-yellow-500/30 bg-yellow-500/10 text-sm text-yellow-300">
            Replace existing user commands?
            <div className="flex gap-2 mt-2">
              <button onClick={() => { setConfirmReplace(false); void doInstall() }} className="px-3 py-1 text-xs rounded bg-accent text-white">Replace</button>
              <button onClick={() => setConfirmReplace(false)} className="px-3 py-1 text-xs">Cancel</button>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary">Cancel</button>
          <button
            onClick={() => void onInstallClick()}
            disabled={installDisabled}
            className="px-3 py-1.5 text-sm rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50"
          >
            {installing ? 'Installing…' : 'Install'}
          </button>
        </div>
      </div>
    </div>
  )
}
