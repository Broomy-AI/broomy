#!/usr/bin/env node
/**
 * Storybook screenshot test orchestrator.
 *
 * 1. Builds Storybook to storybook-static/ (skipped with --no-build or if fresh)
 * 2. Serves it via Node's built-in HTTP server
 * 3. Uses Playwright to screenshot every story (parallel workers)
 * 4. Compares against reference images
 * 5. Generates an HTML report
 *
 * Flags:
 *   --no-build   Skip the Storybook build step (use existing storybook-static/)
 *   --workers=N  Number of parallel browser pages (default: 4)
 */
import { execSync } from 'child_process'
import { existsSync, mkdirSync, statSync, readFileSync, createReadStream } from 'fs'
import { resolve, join, extname } from 'path'
import { createServer } from 'http'
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

const args = process.argv.slice(2)
const noBuild = args.includes('--no-build')
const workersArg = args.find(a => a.startsWith('--workers='))
const WORKERS = workersArg ? parseInt(workersArg.split('=')[1], 10) : 4

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}

function startStaticServer(dir, port) {
  const server = createServer((req, res) => {
    let filePath = join(dir, req.url === '/' ? '/index.html' : req.url.split('?')[0])
    if (!existsSync(filePath)) {
      res.writeHead(404)
      res.end('Not found')
      return
    }
    if (statSync(filePath).isDirectory()) {
      filePath = join(filePath, 'index.html')
    }
    const ext = extname(filePath)
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' })
    createReadStream(filePath).pipe(res)
  })
  return new Promise((resolve) => {
    server.listen(port, () => resolve(server))
  })
}

// Console/page errors that are not story render failures and would otherwise
// cause false positives (e.g. a missing static asset returning 404).
function isIgnorableError(text) {
  return /Failed to load resource/i.test(text)
}

async function captureStory(page, storyId, baseUrl, outDir) {
  // Reset the per-page error buffer (pages are reused across stories).
  page._storyErrors = []
  const url = `${baseUrl}/iframe.html?id=${storyId}&viewMode=story`
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 })
  // Wait for story to render and fonts to load in a single check — no fixed delays.
  // A story that throws during render leaves #storybook-root empty (Storybook
  // paints its error overlay elsewhere), so this times out — long enough for the
  // render error to have been reported to the console.
  await page.waitForFunction(
    () => document.querySelector('#storybook-root > *') !== null && document.fonts.ready.then(() => true),
    { timeout: 5000 }
  ).catch(() => {})
  await page.screenshot({ path: join(outDir, `${storyId}.png`) })
  // A story counts as a render failure only if it errored AND produced no DOM.
  // This distinguishes a story that crashed (empty root) from one that
  // deliberately renders an error state, e.g. an error-boundary demo, which
  // catches the error and renders fallback content into the root.
  const rootEmpty = await page
    .evaluate(() => (document.querySelector('#storybook-root')?.childElementCount ?? 0) === 0)
    .catch(() => false)
  const errors = page._storyErrors.filter(e => !isIgnorableError(e))
  return rootEmpty ? errors : []
}

async function main() {
  const t0 = Date.now()

  // 1. Build Storybook (unless --no-build or storybook-static is fresh)
  if (noBuild) {
    if (!existsSync(STORYBOOK_STATIC)) {
      console.error('storybook-static/ does not exist. Run without --no-build first.')
      process.exit(1)
    }
    console.log('Skipping build (--no-build)')
  } else {
    console.log('Building Storybook...')
    const buildStart = Date.now()
    execSync('npx storybook build -o storybook-static', { cwd: ROOT, stdio: 'inherit' })
    console.log(`Build completed in ${((Date.now() - buildStart) / 1000).toFixed(1)}s`)
  }

  // 2. Start HTTP server (Node built-in, no npx overhead)
  const server = await startStaticServer(STORYBOOK_STATIC, PORT)
  const baseUrl = `http://localhost:${PORT}`

  try {
    // 3. Get story list
    const indexRes = await fetch(`${baseUrl}/index.json`)
    const index = await indexRes.json()

    const storyIds = Object.values(index.entries || index.stories || {})
      .filter((entry) => entry.type === 'story' || !entry.type)
      .map((entry) => entry.id)

    console.log(`Found ${storyIds.length} stories, capturing with ${WORKERS} workers...`)

    // 4. Take screenshots in parallel
    mkdirSync(SCREENSHOTS_DIR, { recursive: true })
    const browser = await chromium.launch({ headless: true })

    // Create a pool of pages. Each page collects uncaught exceptions and
    // console errors into a buffer that captureStory resets per story — a story
    // that errors during render is a test failure even if its pixels match.
    const pages = await Promise.all(
      Array.from({ length: WORKERS }, async () => {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
        const page = await ctx.newPage()
        page._storyErrors = []
        page.on('pageerror', err => page._storyErrors.push(err.message))
        page.on('console', msg => {
          if (msg.type() === 'error') page._storyErrors.push(msg.text())
        })
        return page
      })
    )

    // Pre-warm: load Storybook iframe once per page so JS is cached
    await Promise.all(pages.map(p =>
      p.goto(`${baseUrl}/iframe.html?id=${storyIds[0]}&viewMode=story`, { waitUntil: 'load', timeout: 15000 }).catch(() => {})
    ))

    const captureErrors = []
    const renderErrorsByStory = new Map()
    let completed = 0

    // Worker function: pull story IDs from the shared queue
    const queue = [...storyIds]

    async function worker(page) {
      while (queue.length > 0) {
        const storyId = queue.shift()
        if (!storyId) break
        try {
          const renderErrors = await captureStory(page, storyId, baseUrl, SCREENSHOTS_DIR)
          completed++
          if (renderErrors.length > 0) {
            renderErrorsByStory.set(storyId, renderErrors)
            console.log(`  [${completed}/${storyIds.length}] ✗ ${storyId} — render error: ${renderErrors[0].split('\n')[0]}`)
          } else {
            console.log(`  [${completed}/${storyIds.length}] ✓ ${storyId}`)
          }
        } catch (err) {
          completed++
          captureErrors.push(storyId)
          console.log(`  [${completed}/${storyIds.length}] ✗ ${storyId} — ${err.message}`)
        }
      }
    }

    const captureStart = Date.now()
    await Promise.all(pages.map(p => worker(p)))
    const captureSecs = ((Date.now() - captureStart) / 1000).toFixed(1)
    console.log(`\nScreenshots captured in ${captureSecs}s: ${storyIds.length - captureErrors.length} ok, ${captureErrors.length} failed`)

    await browser.close()

    // 5. Compare against references
    console.log('\nComparing screenshots against references...')
    const results = []
    for (let i = 0; i < storyIds.length; i++) {
      const storyId = storyIds[i]
      const currentPath = join(SCREENSHOTS_DIR, `${storyId}.png`)
      const referencePath = join(REFS_DIR, `${storyId}.png`)
      const diffPath = join(DIFFS_DIR, `${storyId}-diff.png`)

      let result
      if (!existsSync(currentPath)) {
        result = { storyId, diffPixels: 0, totalPixels: 0, diffPercent: 0, status: 'new' }
      } else {
        result = pixelDiff(currentPath, referencePath, diffPath, storyId)
      }

      // A story that errored during render is always a failure — even if its
      // pixels happen to match the reference (e.g. an error overlay that was
      // accepted as the baseline). This catches errors the pixel diff cannot.
      const renderErrors = renderErrorsByStory.get(storyId)
      if (renderErrors) {
        result = { ...result, status: 'fail', renderErrors }
      }
      results.push(result)

      const prefix = `  [${i + 1}/${storyIds.length}]`
      if (renderErrors) {
        console.log(`${prefix} ✗ ${storyId} (render error: ${renderErrors[0].split('\n')[0]})`)
      } else if (result.status === 'pass') {
        console.log(`${prefix} ✓ ${storyId}`)
      } else if (result.status === 'new') {
        console.log(`${prefix} ● ${storyId} (new — no reference)`)
      } else {
        console.log(`${prefix} ✗ ${storyId} (${result.diffPercent.toFixed(2)}% diff)`)
      }
    }

    // 6. Generate report
    const reportPath = join(REPORT_DIR, 'index.html')
    generateReport(results, reportPath, SCREENSHOTS_DIR, REFS_DIR, DIFFS_DIR)
    console.log(`\nReport: ${reportPath}`)

    // 7. Summary
    const passed = results.filter(r => r.status === 'pass').length
    const failed = results.filter(r => r.status === 'fail').length
    const newCount = results.filter(r => r.status === 'new').length
    const totalSecs = ((Date.now() - t0) / 1000).toFixed(1)

    console.log(`\nResults: ${passed} passed, ${failed} failed, ${newCount} new (${totalSecs}s total)`)

    if (failed > 0) {
      console.error('\nFailed stories:')
      for (const r of results.filter(r => r.status === 'fail')) {
        if (r.renderErrors) {
          console.error(`  ✗ ${r.storyId} — render error: ${r.renderErrors[0].split('\n')[0]}`)
        } else {
          console.error(`  ✗ ${r.storyId} — ${r.diffPercent.toFixed(2)}% pixels changed (${r.diffPixels} px)`)
        }
      }
      const hasRenderErrors = results.some(r => r.renderErrors)
      console.error('\nVisual regression test FAILED')
      if (hasRenderErrors) {
        console.error('Stories with render errors must be fixed — they cannot be accepted as a baseline.')
      }
      console.error('Run "pnpm storybook:update-refs" to accept pixel changes as the new baseline.')
      process.exit(1)
    }
  } finally {
    server.close()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
