# Terminal Integration Guide

This guide covers how Broomy manages terminal sessions: PTY creation in the main process, xterm.js rendering in the browser, activity detection heuristics, and the multi-tab terminal system.

## PTY Creation Flow

```
Terminal.tsx                Preload                   Main Process
────────────                ───────                   ────────────
window.pty.create({     --> ipcRenderer.invoke    --> ipcMain.handle('pty:create')
  id, cwd, command,         'pty:create'              pty.spawn(shell, args, opts)
  sessionId, env                                      ptyProcesses.set(id, process)
})                      <-- returns { id }        <-- return { id }
```

### Renderer side

The `Terminal` component generates a unique PTY ID and requests creation:

```ts
const id = `${sessionId}-${Date.now()}`
ptyIdRef.current = id
window.pty.create({ id, cwd: effectCwd, command: cmd, sessionId, env: envVars })
```

The `command` parameter distinguishes agent terminals from user terminals. Agent terminals pass the agent CLI command (e.g., `claude`), while user terminals omit it to get an interactive shell.

### Main process side

The `pty:create` handler spawns a PTY using `node-pty`:

```ts
const shell = getDefaultShell()  // e.g., /bin/zsh
let shellArgs: string[] = []

// Agent commands run via shell's -c flag to inherit user's profile
if (options.command && !isWindows) {
  shellArgs = ['-l', '-i', '-c', options.command]
}

const ptyProcess = pty.spawn(shell, shellArgs, {
  name: 'xterm-256color',
  cols: 80, rows: 30,
  cwd: options.cwd,
  env: { ...process.env, ...agentEnv },
})
ptyProcesses.set(options.id, ptyProcess)
```

Key details:
- Agent commands use `-l -i -c` to load the user's login shell profile.
- Custom env vars from agent config are merged on top of `process.env`.
- `CLAUDE_CONFIG_DIR` is stripped from base env and only set if explicitly configured.
- The `~` prefix in env var values is expanded to the home directory.

## Data Flow

Once a PTY is created, data flows in both directions:

```
User types ──> terminal.onData() ──> window.pty.write(id, data) ──> ptyProcess.write(data)
                                                                          |
PTY output <── terminal.write(data) <── pty:data:${id} event <── ptyProcess.onData(data)
```

### Input path

```ts
// Terminal.tsx
terminal.onData((data) => {
  lastUserInputRef.current = Date.now()
  markSessionRead(sessionId)  // Clear unread badge on user input
  window.pty.write(id, data)
})
```

### Output path

```ts
const removeDataListener = window.pty.onData(id, (data) => {
  terminal.write(data, () => {
    if (isFollowingRef.current) {
      terminal.scrollToBottom()
    }
  })
  // Activity detection runs here for agent terminals (see below)
})
```

### Resize handling

A `ResizeObserver` monitors the container. The xterm grid is re-fitted immediately; the PTY resize IPC is debounced:

```ts
const resizeObserver = new ResizeObserver(() => {
  try { fitAddon.fit() } catch {}
  if (ptyResizeTimeout) clearTimeout(ptyResizeTimeout)
  ptyResizeTimeout = setTimeout(() => {
    window.pty.resize(ptyIdRef.current, terminal.cols, terminal.rows)
  }, 100)
})
```

### Process exit

```ts
// Main process sends pty:exit:${id} with exit code
const removeExitListener = window.pty.onExit(id, (exitCode) => {
  terminal.write(`\r\n[Process exited with code ${exitCode}]\r\n`)
  if (isAgent) scheduleUpdate({ status: 'idle' })
})
```

## Activity Detection

Agent terminals track whether the agent is "working" or "idle" using time-based heuristics. The logic is in `src/renderer/utils/terminalActivityDetector.ts`.

### Configuration

```ts
export const DEFAULT_CONFIG: ActivityDetectorConfig = {
  warmupMs: 5000,          // Ignore first 5s after terminal creation
  inputSuppressionMs: 200, // Pause detection for 200ms after user input
  idleTimeoutMs: 1000,     // After 1s of no output, transition to idle
}
```

### The evaluateActivity function

A pure function that determines what status transition to make on each chunk of data:

```ts
export function evaluateActivity(dataLength, now, state, config): ActivityResult {
  if (dataLength <= 0) return { status: null, scheduleIdle: false }

  // Warmup -- ignore
  if (now - state.startTime < config.warmupMs)
    return { status: null, scheduleIdle: false }

  // Paused after user input or window interaction
  const isPaused = (now - state.lastUserInput < config.inputSuppressionMs) ||
                   (now - state.lastInteraction < config.inputSuppressionMs)
  if (isPaused) return { status: null, scheduleIdle: true }

  // Agent is producing output -- it's working
  return { status: 'working', scheduleIdle: true }
}
```

### How Terminal.tsx uses it

```ts
const result = evaluateActivity(data.length, now, {
  lastUserInput: lastUserInputRef.current,
  lastInteraction: lastInteractionRef.current,
  lastStatus: lastStatusRef.current,
  startTime: effectStartTime,
})

if (result.status === 'working') {
  if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current)
  lastStatusRef.current = 'working'
  scheduleUpdate({ status: 'working' })
}
if (result.scheduleIdle) {
  idleTimeoutRef.current = setTimeout(() => {
    lastStatusRef.current = 'idle'
    scheduleUpdate({ status: 'idle' })
  }, 1000)
}
```

### Detection phases

1. **Warmup (0-5s)**: All data ignored. Prevents shell startup noise from triggering "working."
2. **Input suppression (200ms)**: Echoed characters from user typing are ignored.
3. **Window interaction suppression (200ms)**: Avoids false positives from focus-related output.
4. **Working**: Set immediately when data arrives outside suppression windows.
5. **Idle**: Set after 1s of silence, with a 300ms debounce on the store update.

### Store update debouncing

```ts
const scheduleUpdate = (update) => {
  pendingUpdateRef.current = { ...pendingUpdateRef.current, ...update }
  if (update.status === 'working') {
    flushUpdate()  // Immediate -- responsive UI
  } else {
    updateTimeoutRef.current = setTimeout(flushUpdate, 300)  // Debounced -- avoids flicker
  }
}
```

## Unread Notification System

When an agent transitions from "working" to "idle" after working for 3+ seconds, the session is marked `isUnread`. This alerts users that an agent finished a task.

The unread badge is cleared when:
- The user selects the session
- The user types in the session's terminal (via `markSessionRead`)

## Buffer Registry

The `terminalBufferRegistry` (`src/renderer/utils/terminalBufferRegistry.ts`) allows other components to access terminal content without holding a direct xterm reference:

```ts
export const terminalBufferRegistry = {
  register(sessionId: string, getter: () => string): void
  unregister(sessionId: string): void
  getBuffer(sessionId: string): string | null
  getLastLines(sessionId: string, lineCount: number): string | null
}
```

Agent terminals register a buffer getter using xterm's `SerializeAddon`:

```ts
if (isAgent && sessionId) {
  terminalBufferRegistry.register(sessionId, () => serializeAddon.serialize())
}
```

Other components can then read terminal output on demand:

```ts
const output = terminalBufferRegistry.getBuffer(sessionId)
const lastLines = terminalBufferRegistry.getLastLines(sessionId, 50)
```

## Terminal Tabs (TabbedTerminal)

User terminals support multiple tabs within a session via `TabbedTerminal` (`src/renderer/components/TabbedTerminal.tsx`).

### Tab state

```ts
export interface TerminalTabsState {
  tabs: TerminalTab[]      // { id: string, name: string }
  activeTabId: string | null
}
```

New sessions start with one tab named "Terminal." Tab state is persisted to config.

### How tabs render

Each tab has its own `Terminal` component. Only the active tab is visible:

```tsx
{tabs.map((tab) => (
  <div key={tab.id} className={tab.id === activeTabId ? '' : 'hidden'}>
    <Terminal sessionId={`user-${sessionId}-${tab.id}`} cwd={cwd}
             isActive={isActive && tab.id === activeTabId} />
  </div>
))}
```

The PTY ID `user-${sessionId}-${tab.id}` keeps each tab's PTY distinct from the agent terminal.

### Tab operations

| Action | Description |
|---|---|
| `addTerminalTab(sessionId)` | Creates a new tab and switches to it |
| `removeTerminalTab(sessionId, tabId)` | Closes a tab |
| `renameTerminalTab(sessionId, tabId, name)` | Renames via double-click or context menu |
| `reorderTerminalTabs(sessionId, tabs)` | Drag-and-drop reorder |
| `setActiveTerminalTab(sessionId, tabId)` | Switch visible tab |
| `closeOtherTerminalTabs(sessionId, tabId)` | Close all except one |
| `closeTerminalTabsToRight(sessionId, tabId)` | Close tabs to the right |

## E2E Test Mode

In tests, the main process uses controlled shells:

```ts
if (isE2ETest) {
  if (options.command) {
    initialCommand = `bash "${fakeClaude}"`  // Predictable agent output
  } else {
    initialCommand = 'echo "E2E_TEST_SHELL_READY"'  // User terminal ready marker
  }
}
```

## Cleanup

When the terminal component unmounts:

```ts
return () => {
  removeDataListener(); removeExitListener()
  window.pty.kill(ptyIdRef.current)
  terminal.dispose()
  clearTimeout(updateTimeoutRef.current)
  clearTimeout(idleTimeoutRef.current)
  if (isAgent && lastStatusRef.current === 'working') {
    updateAgentMonitor(sessionId, { status: 'idle' })
  }
  if (isAgent && sessionId) {
    terminalBufferRegistry.unregister(sessionId)
  }
}
```

The main process also kills all PTY processes when a BrowserWindow closes, as a safety net.
