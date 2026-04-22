/**
 * Stamps package.json version with the git commit hash for dev builds.
 * Usage: node scripts/stamp-version.cjs
 *
 * Sets version to e.g. "1.0.0-e2af1d0" so macOS Launch Services
 * doesn't confuse different builds that share the same bundle ID.
 *
 * The original version is restored by restore-version.cjs.
 */
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const pkgPath = path.join(__dirname, '..', 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

const commit = execSync('git rev-parse --short HEAD').toString().trim()
const stamped = `${pkg.version}-${commit}`

// Save original version so restore-version.cjs can put it back
fs.writeFileSync(path.join(__dirname, '..', '.original-version'), pkg.version)

pkg.version = stamped
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

console.log(`Stamped version: ${stamped}`)
