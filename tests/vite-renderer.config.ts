/**
 * Vite config for serving the renderer in E2E dev mode.
 * Mirrors the renderer section of electron.vite.config.ts.
 */
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { execSync } from 'child_process'

const gitCommit = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim() }
  catch { return 'unknown' }
})()

/**
 * In dev mode, Vite injects inline scripts for HMR and React Refresh.
 * The CSP meta tag in index.html blocks these with `script-src 'self'`.
 * This plugin relaxes the CSP to allow Vite's dev scripts.
 */
function relaxCspForDev(): Plugin {
  return {
    name: 'relax-csp-for-dev',
    transformIndexHtml(html) {
      return html.replace(
        /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")[^"]*(")/,
        "$1default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://localhost:*$2",
      )
    },
  }
}

export default defineConfig({
  root: resolve(__dirname, '..', 'src', 'renderer'),
  resolve: {
    alias: {
      '@': resolve(__dirname, '..', 'src', 'renderer'),
    },
  },
  plugins: [react(), relaxCspForDev()],
  define: {
    __BUILD_COMMIT__: JSON.stringify(gitCommit),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
})
