# Windows Testing Guide

How to run Broomy's E2E tests on Windows to verify the app works correctly.

## Prerequisites (one-time setup)

### 1. Install Git

Download from https://git-scm.com/download/win. Use the default settings.

### 2. Install Node.js

Download the LTS version from https://nodejs.org. This also installs npm.

### 3. Install pnpm

Open PowerShell and run:

```powershell
corepack enable
corepack prepare pnpm@latest --activate
```

If `corepack` is not available, install pnpm directly:

```powershell
npm install -g pnpm
```

### 4. Install C++ build tools (required for node-pty)

Broomy uses `node-pty` for terminal emulation, which compiles native C++ code. You need one of:

**Option A — Visual Studio Build Tools (recommended):**
1. Download "Build Tools for Visual Studio" from https://visualstudio.microsoft.com/downloads/ (scroll to "Tools for Visual Studio")
2. In the installer, select the **"Desktop development with C++"** workload
3. Install and restart your terminal

**Option B — windows-build-tools (simpler but older):**
```powershell
npm install -g windows-build-tools
```

### 5. Verify everything works

```powershell
git --version      # any recent version
node --version     # v18+ required, v20 LTS recommended
pnpm --version     # v8+
```

## Running Tests

### Quick start

```powershell
# Clone and test the main branch
.\scripts\windows-e2e-test.ps1
```

On the first run, this clones the repo to `%USERPROFILE%\broomy-e2e`. On subsequent runs, it fetches and pulls the latest code.

### Common options

```powershell
# Test a specific branch (e.g. a PR branch)
.\scripts\windows-e2e-test.ps1 -Branch feature/my-thing

# Show the Electron window while tests run (useful for debugging)
.\scripts\windows-e2e-test.ps1 -Headed

# Skip the git pull (re-test current checkout without updating)
.\scripts\windows-e2e-test.ps1 -SkipPull

# Clean install (removes node_modules before installing)
.\scripts\windows-e2e-test.ps1 -Clean

# Combine options
.\scripts\windows-e2e-test.ps1 -Branch fix/something -Headed -Clean
```

### What the script does

1. Checks that git, node, and pnpm are installed
2. Clones the repo (first run) or fetches + checks out the specified branch
3. Runs `pnpm install`
4. Runs `pnpm build` (full production build)
5. Installs Playwright's Chromium browser
6. Runs `pnpm test:e2e:built` (the full E2E suite against the built app)
7. Reports pass/fail and tells you how to view the HTML report

### Viewing test results

If tests fail, Playwright generates an HTML report. View it with:

```powershell
cd %USERPROFILE%\broomy-e2e
npx playwright show-report
```

This opens a browser with detailed results, screenshots of failures, and trace files for debugging.

## Running tests manually (without the script)

If you prefer to run steps individually:

```powershell
cd %USERPROFILE%\broomy-e2e    # or wherever you cloned the repo

git pull origin main
pnpm install
pnpm build

# Run E2E tests (headless)
$env:E2E_TEST = "true"
$env:E2E_HEADLESS = "true"
pnpm test:e2e:built

# Or with visible window
$env:E2E_HEADLESS = "false"
pnpm test:e2e:built
```

## Troubleshooting

### node-pty fails to compile

This is the most common issue. You'll see errors like `gyp ERR!` or `MSBuild.exe not found`.

**Fix:** Install the "Desktop development with C++" workload in Visual Studio Installer. Make sure to restart your terminal after installing.

If you already have VS Build Tools installed but it still fails, try setting the version explicitly:

```powershell
$env:GYP_MSVS_VERSION = "2022"    # or 2019
pnpm install
```

### Electron fails to download

If the Electron binary download times out or fails behind a corporate proxy:

```powershell
# Set proxy if needed
$env:ELECTRON_GET_USE_PROXY = "true"
$env:HTTPS_PROXY = "http://your-proxy:port"

# Retry
Remove-Item -Recurse -Force node_modules\electron
pnpm install
```

### Tests time out

Electron E2E tests have a 30-second timeout per test. If your machine is slow:

1. Run with `-Headed` to see what's happening
2. Check if antivirus is scanning the Electron binary (add an exclusion for the working directory)
3. Try closing other applications to free resources

### PowerShell execution policy

If Windows blocks the script with "running scripts is disabled on this system":

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### "pnpm: command not found" after installing

Close and reopen your terminal, or run:

```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
```

## What the E2E tests verify

The test suite checks that the app works correctly on Windows:

- **App startup**: Window opens, React renders, sidebar shows sessions
- **Session management**: Switching between sessions, session state display
- **Terminal integration**: xterm.js renders, can type and execute commands, fake Claude agent runs
- **Panel system**: Explorer, Settings, and Guide panels toggle correctly
- **Keyboard shortcuts**: Panel toggles (Ctrl+1/2/3) and session navigation (Alt+Up/Down)
- **Terminal tabs**: Adding user terminal tabs, switching between Agent and user tabs
- **Terminal persistence**: Terminal state preserved when switching sessions

All tests run against mock data (no real git repos, APIs, or config files are touched).
