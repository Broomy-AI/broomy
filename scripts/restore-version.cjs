/**
 * Restores the original package.json version after a stamped build.
 * Usage: node scripts/restore-version.cjs
 */
const fs = require('fs')
const path = require('path')

const pkgPath = path.join(__dirname, '..', 'package.json')
const origPath = path.join(__dirname, '..', '.original-version')

if (!fs.existsSync(origPath)) {
  // Nothing to restore — stamp-version was never run
  process.exit(0)
}

const original = fs.readFileSync(origPath, 'utf8').trim()
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

pkg.version = original
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
fs.unlinkSync(origPath)

console.log(`Restored version: ${original}`)
