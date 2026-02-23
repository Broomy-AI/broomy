#!/usr/bin/env node
/**
 * Run feature documentation tests for specific features.
 *
 * Usage:
 *   node scripts/feature-docs.cjs <feature-name> [feature-name...]
 *
 * Examples:
 *   node scripts/feature-docs.cjs session-switching
 *   node scripts/feature-docs.cjs session-switching issue-link
 *
 * Available features are directories under tests/features/ (excluding _shared).
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const featuresDir = path.join(__dirname, '..', 'tests', 'features')
const args = process.argv.slice(2)

// List available features
const available = fs.readdirSync(featuresDir, { withFileTypes: true })
  .filter(d => d.isDirectory() && !d.name.startsWith('_'))
  .map(d => d.name)
  .sort()

if (args.length === 0) {
  console.error('\nUsage: pnpm test:feature-docs <feature-name> [feature-name...]\n')
  console.error('Available features:')
  for (const f of available) {
    console.error(`  - ${f}`)
  }
  console.error('')
  process.exit(1)
}

// Validate feature names
const invalid = args.filter(a => !available.includes(a))
if (invalid.length > 0) {
  console.error(`\nUnknown feature(s): ${invalid.join(', ')}`)
  console.error('\nAvailable features:')
  for (const f of available) {
    console.error(`  - ${f}`)
  }
  console.error('')
  process.exit(1)
}

// Build playwright test paths
const testPaths = args.map(f => `tests/features/${f}/`)

const cmd = `npx playwright test --config playwright.features.config.ts ${testPaths.join(' ')}`

try {
  execSync(cmd, { cwd: path.join(__dirname, '..'), stdio: 'inherit', env: { ...process.env, E2E_DEV: 'true' } })
} catch (e) {
  process.exit(e.status || 1)
}
