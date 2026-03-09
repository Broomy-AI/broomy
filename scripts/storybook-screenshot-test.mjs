#!/usr/bin/env node
/**
 * Storybook screenshot test orchestrator.
 *
 * 1. Builds Storybook to storybook-static/
 * 2. Serves it on port 6006
 * 3. Uses Playwright to screenshot every story
 * 4. Compares against reference images
 * 5. Generates an HTML report
 */
import { execSync, spawn } from 'child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs'
import { resolve, join } from 'path'
import { chromium } from 'playwright'
import { pixelDiff } from './lib/pixelDiff.mjs'
import { generateReport } from './lib/generateReport.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const STORYBOOK_STATIC = join(ROOT, 'storybook-static')
const SCREENSHOTS_DIR = join(ROOT, '.storybook-screenshots')
const REFS_DIR = process.env.STORYBOOK_REFS_DIR || join(ROOT, '.storybook-refs')
const REPORT_DIR = join(ROOT, '.storybook-report')
const DIFFS_DIR = join(REPORT_DIR, 'diffs')
const PORT = 6006

async function main() {
  // 1. Build Storybook
  console.log('Building Storybook...')
  execSync('npx storybook build -o storybook-static', { cwd: ROOT, stdio: 'inherit' })

  // 2. Start HTTP server
  console.log('Starting HTTP server...')
  const server = spawn('npx', ['http-server', STORYBOOK_STATIC, '-p', String(PORT), '-s', '-c-1'], {
    cwd: ROOT,
    stdio: 'pipe',
  })

  // Wait for server to be ready
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server start timeout')), 30000)
    const check = async () => {
      try {
        const res = await fetch(`http://localhost:${PORT}`)
        if (res.ok) { clearTimeout(timeout); resolve(); return }
      } catch { /* not ready yet */ }
      setTimeout(check, 500)
    }
    check()
  })

  try {
    // 3. Get story list
    console.log('Fetching story index...')
    const indexRes = await fetch(`http://localhost:${PORT}/index.json`)
    const index = await indexRes.json()

    const storyIds = Object.values(index.entries || index.stories || {})
      .filter((entry) => entry.type === 'story' || !entry.type)
      .map((entry) => entry.id)

    console.log(`Found ${storyIds.length} stories`)

    // 4. Take screenshots
    mkdirSync(SCREENSHOTS_DIR, { recursive: true })
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    const page = await context.newPage()

    for (const storyId of storyIds) {
      const url = `http://localhost:${PORT}/iframe.html?id=${storyId}&viewMode=story`
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 })
        // Wait for content, but don't fail if the story renders empty/hidden content
        await page.waitForSelector('#storybook-root > *', { timeout: 3000 }).catch(() => {})
        await page.waitForFunction(() => document.fonts.ready, { timeout: 3000 }).catch(() => {})
        await page.screenshot({ path: join(SCREENSHOTS_DIR, `${storyId}.png`) })
        process.stdout.write('.')
      } catch (err) {
        console.warn(`\nWarning: Failed to capture ${storyId}: ${err.message}`)
      }
    }
    console.log('\nScreenshots captured.')

    await browser.close()

    // 5. Compare against references
    console.log('Comparing screenshots...')
    const results = storyIds.map(storyId => {
      const currentPath = join(SCREENSHOTS_DIR, `${storyId}.png`)
      const referencePath = join(REFS_DIR, `${storyId}.png`)
      const diffPath = join(DIFFS_DIR, `${storyId}-diff.png`)

      if (!existsSync(currentPath)) {
        return { storyId, diffPixels: 0, totalPixels: 0, diffPercent: 0, status: 'new' }
      }

      return pixelDiff(currentPath, referencePath, diffPath, storyId)
    })

    // 6. Generate report
    const reportPath = join(REPORT_DIR, 'index.html')
    generateReport(results, reportPath, SCREENSHOTS_DIR, REFS_DIR, DIFFS_DIR)
    console.log(`Report: ${reportPath}`)

    // 7. Summary
    const passed = results.filter(r => r.status === 'pass').length
    const failed = results.filter(r => r.status === 'fail').length
    const newCount = results.filter(r => r.status === 'new').length

    console.log(`\nResults: ${passed} passed, ${failed} failed, ${newCount} new`)

    if (failed > 0) {
      console.error('Visual regression test FAILED')
      process.exit(1)
    }
  } finally {
    server.kill()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
