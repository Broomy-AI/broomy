/**
 * Playwright global setup: runs once before all test files.
 *
 * Standard mode (pnpm test):
 *   1. Ensures the Electron binary is downloaded
 *   2. Runs `pnpm build` so every spec file can use the built output
 *
 * Dev mode (pnpm test:dev / E2E_DEV=true):
 *   1. Ensures the Electron binary is downloaded
 *   2. Builds only main + preload (skips the slow renderer build)
 *   3. Starts a Vite dev server for the renderer on an available port
 *   4. Sets ELECTRON_RENDERER_URL so Electron loads from the dev server
 */

import { execSync, spawn, type ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

const isDevMode = process.env.E2E_DEV === 'true'

/** File used to pass the dev server PID to global-teardown */
export const PID_FILE = path.join(ROOT, 'tests', '.vite-dev-server.pid')

function run(cmd: string) {
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' })
}

function ensureElectronBinary() {
  const electronDir = path.join(ROOT, 'node_modules', 'electron')
  const distDir = path.join(electronDir, 'dist')
  const pathTxt = path.join(electronDir, 'path.txt')

  if (
    fs.existsSync(distDir) &&
    fs.existsSync(pathTxt) &&
    fs.existsSync(path.join(distDir, fs.readFileSync(pathTxt, 'utf-8').trim()))
  ) {
    return // already present
  }

  console.log('\n  Electron binary missing — downloading…\n')
  try {
    run('node node_modules/electron/install.js')
  } catch {
    console.error('Electron download failed. Try: rm -rf node_modules/electron && pnpm install')
    process.exit(1)
  }

  if (!fs.existsSync(pathTxt)) {
    console.error('Electron binary still missing after download. Try: rm -rf node_modules && pnpm install')
    process.exit(1)
  }
}

/**
 * Start a Vite dev server for the renderer and wait until it's ready.
 * Vite auto-selects an available port if the default is taken.
 */
function startRendererDevServer(): Promise<{ url: string; child: ChildProcess }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'npx',
      ['vite', '--config', path.join('tests', 'vite-renderer.config.ts')],
      {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, FORCE_COLOR: '0' },
      },
    )

    let output = ''
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error(`Vite dev server failed to start within 30s. Output:\n${output}`))
    }, 30000)

    const onData = (data: Buffer) => {
      output += data.toString()
      // Strip ANSI escape codes before matching — Vite embeds them in the URL
      const clean = output.replace(/\x1b\[[0-9;]*m/g, '')
      // Vite prints "Local: http://localhost:5173/" — port may vary
      const match = clean.match(/Local:\s+(https?:\/\/[^\s]+)/)
      if (match) {
        clearTimeout(timeout)
        const url = match[1].replace(/\/$/, '')
        resolve({ url, child })
      }
    }

    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)

    child.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    child.on('exit', (code) => {
      clearTimeout(timeout)
      if (code !== 0) {
        reject(new Error(`Vite dev server exited with code ${code}. Output:\n${output}`))
      }
    })
  })
}

export default async function globalSetup() {
  ensureElectronBinary()

  if (isDevMode) {
    // Dev mode: build only main + preload (~0.5s vs ~70s for full build)
    console.log('\n  Building main + preload for E2E dev mode…\n')
    run('node tests/build-main-preload.mjs')

    console.log('\n  Starting Vite dev server for renderer…\n')
    const { url, child } = await startRendererDevServer()

    // Save PID so global-teardown can clean up
    fs.writeFileSync(PID_FILE, String(child.pid))

    // Set ELECTRON_RENDERER_URL so all test specs pick it up via ...process.env
    process.env.ELECTRON_RENDERER_URL = url
    console.log(`  Renderer dev server ready at ${url}\n`)
  } else if (process.env.E2E_SKIP_BUILD === 'true') {
    // Pre-built mode (Docker): skip building, app is already compiled
    console.log('\n  Skipping build (E2E_SKIP_BUILD=true) — using pre-built output\n')
  } else {
    // Standard mode: full production build
    console.log('\n  Building app for E2E tests…\n')
    run('pnpm build')
  }
}
