/**
 * Playwright global teardown: clean up the Vite dev server started in dev mode.
 */

import fs from 'fs'
import { PID_FILE } from './global-setup'

export default function globalTeardown() {
  if (!fs.existsSync(PID_FILE)) return

  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10)
  fs.unlinkSync(PID_FILE)

  if (!pid || isNaN(pid)) return

  try {
    process.kill(pid, 'SIGTERM')
    console.log(`\n  Stopped Vite dev server (PID ${pid})\n`)
  } catch {
    // Process already exited — nothing to do
  }
}
