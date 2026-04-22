import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { execSync } from 'child_process'
import type { Plugin } from 'vite'

// Capture git info at build time so dev builds can identify their exact commit
const gitCommit = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim() }
  catch { return 'unknown' }
})()
const buildTime = new Date().toISOString()

/**
 * Vite plugin that injects a minimal `process` shim into the renderer bundle.
 *
 * Monaco editor internally references process.cwd(), process.platform, and
 * process.arch. The renderer runs with nodeIntegration:false, so `process`
 * is undefined. On macOS Electron happens to expose a limited process object
 * even without nodeIntegration, but on Windows it doesn't — causing
 * "process is not defined" crashes when opening any file viewer.
 */
function processShimPlugin(): Plugin {
  const shimCode = `\
if (typeof globalThis.process === 'undefined') {
  globalThis.process = { env: {}, platform: 'browser', arch: 'x64', cwd: () => '/' };
} else if (typeof globalThis.process.cwd !== 'function') {
  globalThis.process.cwd = () => '/';
}
`
  return {
    name: 'process-shim',
    transformIndexHtml(html) {
      return html.replace('<head>', `<head><script>${shimCode}</script>`)
    },
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      __BUILD_COMMIT__: JSON.stringify(gitCommit),
      __BUILD_TIME__: JSON.stringify(buildTime),
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          'workers/fsSearch.worker': resolve('src/main/workers/fsSearch.worker.ts'),
          'workers/tsProject.worker': resolve('src/main/workers/tsProject.worker.ts'),
        },
        external: ['node-pty', 'simple-git']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].js'
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer')
      }
    },
    plugins: [processShimPlugin(), react()],
    define: {
      __BUILD_COMMIT__: JSON.stringify(gitCommit),
      __BUILD_TIME__: JSON.stringify(buildTime),
    },
  }
})
