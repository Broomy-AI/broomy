#!/usr/bin/env node

// Preflight checks before starting the dev server.
// Detects common setup issues and either fixes them automatically
// or tells the user exactly what to do.

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const red = (s) => `\x1b[31m${s}\x1b[0m`
const green = (s) => `\x1b[32m${s}\x1b[0m`
const yellow = (s) => `\x1b[33m${s}\x1b[0m`
const bold = (s) => `\x1b[1m${s}\x1b[0m`

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts })
}

function runQuiet(cmd) {
  return execSync(cmd, { cwd: ROOT, stdio: 'pipe' }).toString().trim()
}

function check(label, fn) {
  process.stdout.write(`  ${label}... `)
  try {
    const result = fn()
    if (result === true) {
      console.log(green('ok'))
      return true
    }
    // result is a string describing the fix needed
    console.log(yellow('fixing'))
    return result
  } catch (e) {
    console.log(red('failed'))
    return e.message || 'unknown error'
  }
}

async function main() {
  console.log(bold('\nBroomy dev preflight checks\n'))
  let needsAction = false

  // 1. Check node_modules exists
  const hasNodeModules = check('node_modules installed', () => {
    if (!fs.existsSync(path.join(ROOT, 'node_modules'))) {
      return 'missing'
    }
    // Quick sanity check that key deps are present
    for (const dep of ['electron', 'electron-vite', 'react', 'node-pty']) {
      if (!fs.existsSync(path.join(ROOT, 'node_modules', dep))) {
        return `missing dependency: ${dep}`
      }
    }
    return true
  })

  if (hasNodeModules !== true) {
    console.log(`\n  ${yellow('>')} Running pnpm install...\n`)
    try {
      run('pnpm install')
    } catch {
      console.error(`\n${red('pnpm install failed.')} Try:`)
      console.error(`  rm -rf node_modules && pnpm install\n`)
      process.exit(1)
    }
  }

  // 2. Check electron binary is downloaded
  const hasElectron = check('Electron binary downloaded', () => {
    const electronDir = path.join(ROOT, 'node_modules', 'electron')
    const distDir = path.join(electronDir, 'dist')
    if (!fs.existsSync(distDir)) return 'dist directory missing'

    // On macOS the binary is at dist/Electron.app/Contents/MacOS/Electron
    // On Linux: dist/electron
    // On Windows: dist/electron.exe
    const pathTxt = path.join(electronDir, 'path.txt')
    if (!fs.existsSync(pathTxt)) return 'path.txt missing'

    const relPath = fs.readFileSync(pathTxt, 'utf-8').trim()
    if (!fs.existsSync(path.join(distDir, relPath))) return 'binary missing'

    return true
  })

  if (hasElectron !== true) {
    console.log(`\n  ${yellow('>')} Downloading Electron binary...\n`)
    try {
      run('node node_modules/electron/install.js')
    } catch {
      console.error(`\n${red('Electron download failed.')} Try:`)
      console.error(`  rm -rf node_modules/electron && pnpm install\n`)
      process.exit(1)
    }

    // Verify it worked
    const electronDir = path.join(ROOT, 'node_modules', 'electron')
    const pathTxt = path.join(electronDir, 'path.txt')
    if (!fs.existsSync(pathTxt)) {
      console.error(`\n${red('Electron binary still missing after download.')} Try:`)
      console.error(`  rm -rf node_modules && pnpm install\n`)
      process.exit(1)
    }
  }

  // 3. Check native modules are built for Electron
  const hasNativeModules = check('Native modules built', () => {
    const nodePtyDir = path.join(ROOT, 'node_modules', 'node-pty')
    if (!fs.existsSync(nodePtyDir)) return 'node-pty missing'

    // Check for prebuilds or build directory
    const hasPrebuilds = fs.existsSync(path.join(nodePtyDir, 'prebuilds'))
    const hasBuild = fs.existsSync(path.join(nodePtyDir, 'build'))
    if (!hasPrebuilds && !hasBuild) return 'no prebuilds or build'

    // On macOS/Linux, check spawn-helper is executable
    if (process.platform !== 'win32' && hasPrebuilds) {
      const platformPrefix = process.platform === 'darwin' ? 'darwin' : 'linux'
      try {
        const prebuildsDir = path.join(nodePtyDir, 'prebuilds')
        const dirs = fs.readdirSync(prebuildsDir).filter(d => d.startsWith(platformPrefix))
        for (const dir of dirs) {
          const helper = path.join(prebuildsDir, dir, 'spawn-helper')
          if (fs.existsSync(helper)) {
            try {
              fs.accessSync(helper, fs.constants.X_OK)
            } catch {
              return 'spawn-helper not executable'
            }
          }
        }
      } catch {
        // Ignore read errors
      }
    }

    return true
  })

  if (hasNativeModules !== true) {
    console.log(`\n  ${yellow('>')} Rebuilding native modules for Electron...\n`)
    try {
      run('npx @electron/rebuild 2>&1')
      // Also fix spawn-helper permissions
      if (process.platform !== 'win32') {
        try {
          run('chmod +x node_modules/node-pty/prebuilds/darwin-*/spawn-helper 2>/dev/null || true', { stdio: 'pipe' })
          run('chmod +x node_modules/node-pty/prebuilds/linux-*/spawn-helper 2>/dev/null || true', { stdio: 'pipe' })
        } catch {
          // Ignore
        }
      }
    } catch {
      console.error(`\n${red('Native module rebuild failed.')} Try:`)
      console.error(`  npx @electron/rebuild`)
      console.error(`  # or: rm -rf node_modules && pnpm install\n`)
      process.exit(1)
    }
  }

  console.log(green('\n  All checks passed. Starting dev server...\n'))
}

main().then(() => {
  // Hand off to electron-vite dev
  const { spawn } = require('child_process')
  const bin = path.join(ROOT, 'node_modules', '.bin', 'electron-vite')
  const child = spawn(bin, ['dev'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })
  child.on('exit', (code) => process.exit(code ?? 0))
  // Forward signals so Ctrl+C works cleanly
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => child.kill(sig))
  }
}).catch((e) => {
  console.error(red(`\nPreflight error: ${e.message}\n`))
  process.exit(1)
})
