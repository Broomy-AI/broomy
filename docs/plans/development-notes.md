# Agent Manager - Development Notes

## Project Status

**Current State**: MVP with working UI, terminal integration, and comprehensive E2E tests.

### Completed
- [x] Project setup (Electron + React + Vite)
- [x] 3-pane layout with Tailwind CSS
- [x] xterm.js terminal integration with node-pty
- [x] Playwright automated testing (23 tests passing)
- [x] Window dragging support
- [x] Session list with status indicators
- [x] Toggle panels (Files, User Terminal)
- [x] E2E test mode with controlled shell output

### Pending
- [ ] Session management with persistence
- [ ] Command presets for auto-spawning agents
- [ ] Git branch detection
- [ ] Agent status detection from terminal output
- [ ] macOS notifications
- [ ] File panel with real file listing
- [ ] Monaco editor for file viewing/diffs

---

## Key Technical Discoveries

### 1. Electron Preload Scripts Must Be CommonJS

**Problem**: Electron's sandbox mode doesn't support ES modules in preload scripts.

**Error**: `SyntaxError: Cannot use import statement outside a module`

**Solution**: Configure electron-vite to output CommonJS for preload:

```typescript
// electron.vite.config.ts
preload: {
  plugins: [externalizeDepsPlugin()],
  build: {
    rollupOptions: {
      output: {
        format: 'cjs',
        entryFileNames: '[name].js'  // Use .js not .mjs
      }
    }
  }
}
```

### 2. pnpm Blocks Build Scripts by Default

**Problem**: pnpm v10+ blocks postinstall scripts for security, preventing electron from downloading its binary.

**Error**: `Error: Electron uninstall`

**Solution**: Add `pnpm.onlyBuiltDependencies` to package.json:

```json
{
  "pnpm": {
    "onlyBuiltDependencies": ["electron", "esbuild", "node-pty"]
  }
}
```

### 3. PTY Spawn Fails with Invalid cwd

**Problem**: node-pty throws `posix_spawnp failed` when the working directory doesn't exist.

**Solution**: Always use a valid directory (e.g., `/tmp` for demos, or validate before spawning).

### 4. xterm.js Package Names Changed

**Problem**: `xterm` and `xterm-addon-fit` are deprecated.

**Solution**: Use new package names:
- `xterm` → `@xterm/xterm`
- `xterm-addon-fit` → `@xterm/addon-fit`

---

## Project Structure

```
agent-manager/
├── src/
│   ├── main/
│   │   └── index.ts          # Electron main process, PTY management
│   ├── preload/
│   │   └── index.ts          # Context bridge for PTY API
│   └── renderer/
│       ├── App.tsx           # Main React component
│       ├── index.css         # Tailwind CSS
│       └── components/
│           ├── Layout.tsx    # 3-pane layout with drag regions
│           ├── SessionList.tsx
│           ├── Terminal.tsx  # xterm.js wrapper
│           └── FilePanel.tsx
├── tests/
│   └── app.spec.ts           # Playwright E2E tests
├── mocks/
│   └── fake-claude.sh        # Mock Claude CLI for testing
├── docs/plans/
│   ├── implementation-plan.md
│   └── development-notes.md  # This file
├── electron.vite.config.ts
├── playwright.config.ts
├── tailwind.config.js
└── package.json
```

---

## Configuration Files

### electron.vite.config.ts
- Main process: externalizes node-pty (native module)
- Preload: outputs CommonJS format (.js)
- Renderer: React with path aliases

### package.json Scripts
- `pnpm dev` - Development with hot reload
- `pnpm build` - Production build
- `pnpm test` - Run Playwright tests
- `pnpm test:headed` - Run tests with visible browser

---

## Testing

### Running Tests
```bash
pnpm test           # Headless
pnpm test:headed    # See the app
```

### Test Coverage (23 tests)
**Agent Manager App**
- App title and branding
- New Session button
- Session list rendering
- Status indicators (working/waiting/idle)
- Branch names display
- Files panel toggle
- Terminal panel toggle
- Session switching

**Terminal Integration**
- Terminal container presence
- xterm canvas rendering
- Shell content (not error)
- Keyboard input to terminal
- Command execution and output

**Layout**
- Layout structure (title bar, sidebar, main content)
- Status color indicators

**File Panel**
- Tree/Diff toggle buttons
- File tree placeholder items
- Directory path display

**Button States**
- Files button highlighting
- Terminal button highlighting

**E2E Shell Integration**
- E2E test ready marker
- Echo command execution
- Test shell prompt display

### Debug Test
If tests fail, create a debug test that captures:
- Page HTML content
- Console messages and errors
- Screenshots

---

## IPC API

### PTY Operations (Main ↔ Renderer)

```typescript
// Exposed via window.pty

// Create a new PTY
window.pty.create({ id: string, cwd: string, command?: string })

// Write data to PTY
window.pty.write(id: string, data: string)

// Resize PTY
window.pty.resize(id: string, cols: number, rows: number)

// Kill PTY
window.pty.kill(id: string)

// Listen for data
window.pty.onData(id: string, callback: (data: string) => void)

// Listen for exit
window.pty.onExit(id: string, callback: (exitCode: number) => void)
```

---

## UI Components

### Layout
- Title bar with drag region (`WebkitAppRegion: 'drag'`)
- Buttons excluded from drag (`WebkitAppRegion: 'no-drag'`)
- Sidebar: 224px fixed width
- Main terminal: flexible
- File panel: 320px, togglable
- User terminal: 192px height, togglable

### Session List
- Status indicators with colors:
  - Green (`.bg-status-working`) - actively processing
  - Yellow (`.bg-status-waiting`) - needs input
  - Gray (`.bg-status-idle`) - idle
  - Red (`.bg-status-error`) - error state
- Branch name display
- Click to switch sessions

### Terminal
- xterm.js with dark theme
- FitAddon for responsive sizing
- Error handling with colored output
- ResizeObserver for dynamic sizing

---

## Next Steps

### Phase 4: Session Management
1. Create Zustand store for app state
2. Add "New Session" dialog with directory picker
3. Implement session persistence to `~/.agent-manager/config.json`
4. Command presets UI

### Phase 5: Git Integration
1. Use `simple-git` to detect current branch
2. Watch for branch changes
3. Update session display

### Phase 6: Agent Status Detection
1. Parse terminal output for patterns
2. Detect "waiting for input" state
3. macOS notifications via Electron

### Phase 7: File Panel
1. Read directory contents
2. File tree component
3. Monaco editor integration
4. Git diff view

---

## Commands Reference

```bash
# Development
pnpm install          # Install dependencies
pnpm dev              # Start dev server with HMR
pnpm build            # Build for production
pnpm test             # Run automated tests

# Git
git add .
git commit -m "message"
git push origin main
```

---

## Troubleshooting

### App shows blank screen
1. Check browser console for errors
2. Verify preload script loaded (look for "Unable to load preload script")
3. Ensure preload is CommonJS format (.js not .mjs)

### Terminal doesn't work
1. Check if PTY creation failed in console
2. Verify working directory exists
3. Check if window.pty is defined

### Tests fail
1. Run debug test to capture screenshots
2. Check console errors in test output
3. Ensure app is built before tests run

### pnpm install fails for electron
1. Add electron to `pnpm.onlyBuiltDependencies`
2. Delete node_modules and reinstall

### node-pty "posix_spawnp failed" error
1. This happens when node-pty isn't built for Electron's Node version
2. Run `npx @electron/rebuild` to rebuild native modules for Electron
3. Verify with `ls node_modules/node-pty/build/Release/` - should show `pty.node`
