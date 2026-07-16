/**
 * Runs all project-specific validation checks.
 * Add new checks to the CHECKS array below.
 */
const { execSync } = require('child_process')
const path = require('path')

const CHECKS = [
  { name: 'workers', script: 'check-workers.cjs' },
  { name: 'colors', script: 'check-colors.cjs' },
]

let failed = 0

for (const check of CHECKS) {
  const scriptPath = path.join(__dirname, check.script)
  try {
    execSync(`node "${scriptPath}"`, { stdio: 'inherit' })
  } catch {
    failed++
  }
}

if (failed > 0) {
  console.error(`\n${failed} of ${CHECKS.length} check(s) failed`)
  process.exit(1)
} else {
  console.log(`\nAll ${CHECKS.length} check(s) passed`)
}
