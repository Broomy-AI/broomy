// Cross-platform postinstall: rebuild native deps and chmod spawn-helper on Unix only
const { execSync } = require('child_process')

if (process.platform !== 'win32') {
  // On Windows, electron-builder install-app-deps fails when pnpm is installed via nvm
  // because it tries to exec pnpm.cjs directly rather than the .cmd wrapper.
  // node-pty ships prebuilt Windows binaries so no rebuild is needed there.
  try {
    execSync('electron-builder install-app-deps', { stdio: 'inherit' })
  } catch (e) {
    process.exit(1)
  }

  try {
    execSync('chmod +x node_modules/node-pty/prebuilds/darwin-*/spawn-helper 2>/dev/null || true', { stdio: 'ignore' })
    execSync('chmod +x node_modules/node-pty/prebuilds/linux-*/spawn-helper 2>/dev/null || true', { stdio: 'ignore' })
  } catch {
    // Ignore errors — prebuilds may not exist for this platform
  }
}
