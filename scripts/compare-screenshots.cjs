#!/usr/bin/env node
/**
 * Pixel-by-pixel screenshot comparison and HTML report generation.
 *
 * Called by release-screenshot-compare.sh with the output directory as argument.
 * Compares baseline/ and current/ screenshots, generates diff images and an HTML report.
 *
 * Dependencies: pixelmatch, pngjs (devDependencies in package.json)
 */

const fs = require('fs')
const path = require('path')
const { PNG } = require('pngjs')
const pixelmatch = require('pixelmatch')

const outputDir = process.argv[2]
if (!outputDir) {
  console.error('Usage: node compare-screenshots.cjs <output-dir>')
  process.exit(1)
}

const baselineDir = path.join(outputDir, 'baseline')
const currentDir = path.join(outputDir, 'current')
const diffsDir = path.join(outputDir, 'diffs')
const baselineResultsPath = path.join(outputDir, 'baseline-results.json')
const currentResultsPath = path.join(outputDir, 'current-results.json')

// ── Collect all screenshot paths ────────────────────────────

function collectScreenshots(rootDir) {
  const screenshots = {}
  if (!fs.existsSync(rootDir)) return screenshots

  for (const feature of fs.readdirSync(rootDir)) {
    const featureDir = path.join(rootDir, feature)
    if (!fs.statSync(featureDir).isDirectory()) continue

    for (const file of fs.readdirSync(featureDir)) {
      if (!file.endsWith('.png')) continue
      const key = `${feature}/${file}`
      screenshots[key] = path.join(featureDir, file)
    }
  }
  return screenshots
}

// ── Compare two PNGs ────────────────────────────────────────

function compareImages(baselinePath, currentPath, diffPath) {
  const baselineData = fs.readFileSync(baselinePath)
  const currentData = fs.readFileSync(currentPath)

  const baseline = PNG.sync.read(baselineData)
  const current = PNG.sync.read(currentData)

  // If dimensions differ, we need to handle that
  const width = Math.max(baseline.width, current.width)
  const height = Math.max(baseline.height, current.height)

  // Create padded versions if dimensions differ
  const padded1 = createPaddedImage(baseline, width, height)
  const padded2 = createPaddedImage(current, width, height)

  const diff = new PNG({ width, height })
  const numDiffPixels = pixelmatch(padded1.data, padded2.data, diff.data, width, height, {
    threshold: 0.1,
  })

  fs.mkdirSync(path.dirname(diffPath), { recursive: true })
  fs.writeFileSync(diffPath, PNG.sync.write(diff))

  const totalPixels = width * height
  const diffPercent = totalPixels > 0 ? (numDiffPixels / totalPixels) * 100 : 0

  return {
    diffPixels: numDiffPixels,
    totalPixels,
    diffPercent: Math.round(diffPercent * 100) / 100,
    baselineSize: { width: baseline.width, height: baseline.height },
    currentSize: { width: current.width, height: current.height },
    dimensionsChanged: baseline.width !== current.width || baseline.height !== current.height,
  }
}

function createPaddedImage(img, targetWidth, targetHeight) {
  if (img.width === targetWidth && img.height === targetHeight) return img

  const padded = new PNG({ width: targetWidth, height: targetHeight, fill: true })
  // Fill with transparent pink to make size differences visible
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const idx = (y * targetWidth + x) * 4
      if (x < img.width && y < img.height) {
        const srcIdx = (y * img.width + x) * 4
        padded.data[idx] = img.data[srcIdx]
        padded.data[idx + 1] = img.data[srcIdx + 1]
        padded.data[idx + 2] = img.data[srcIdx + 2]
        padded.data[idx + 3] = img.data[srcIdx + 3]
      } else {
        padded.data[idx] = 255
        padded.data[idx + 1] = 0
        padded.data[idx + 2] = 255
        padded.data[idx + 3] = 128
      }
    }
  }
  return padded
}

// ── Main comparison logic ───────────────────────────────────

const baselineScreenshots = collectScreenshots(baselineDir)
const currentScreenshots = collectScreenshots(currentDir)

const allKeys = new Set([...Object.keys(baselineScreenshots), ...Object.keys(currentScreenshots)])

const results = {
  unchanged: [],
  changed: [],
  added: [],
  removed: [],
}

let processed = 0
const total = allKeys.size

for (const key of [...allKeys].sort()) {
  processed++
  const inBaseline = key in baselineScreenshots
  const inCurrent = key in currentScreenshots

  if (inBaseline && inCurrent) {
    const diffPath = path.join(diffsDir, key)
    const comparison = compareImages(baselineScreenshots[key], currentScreenshots[key], diffPath)

    // Treat sub-pixel rendering noise (<0.1% diff, same dimensions) as unchanged
    const isNoise = comparison.diffPercent < 0.1 && !comparison.dimensionsChanged
    if (comparison.diffPercent === 0 && !comparison.dimensionsChanged) {
      results.unchanged.push({ key, ...comparison })
      process.stdout.write(`  [${processed}/${total}] ${key} — ${dim('unchanged')}\n`)
    } else if (isNoise) {
      results.unchanged.push({ key, ...comparison })
      process.stdout.write(`  [${processed}/${total}] ${key} — ${dim(`unchanged (${comparison.diffPercent}% noise)`)}\n`)
    } else {
      results.changed.push({ key, ...comparison, diffPath: `diffs/${key}` })
      process.stdout.write(
        `  [${processed}/${total}] ${key} — ${yellow(`${comparison.diffPercent}% changed`)}\n`,
      )
    }
  } else if (inCurrent && !inBaseline) {
    results.added.push({ key })
    process.stdout.write(`  [${processed}/${total}] ${key} — ${green('added')}\n`)
  } else {
    results.removed.push({ key })
    process.stdout.write(`  [${processed}/${total}] ${key} — ${red('removed')}\n`)
  }
}

// Load test results
const baselineResults = fs.existsSync(baselineResultsPath)
  ? JSON.parse(fs.readFileSync(baselineResultsPath, 'utf-8'))
  : null
const currentResults = fs.existsSync(currentResultsPath)
  ? JSON.parse(fs.readFileSync(currentResultsPath, 'utf-8'))
  : null

// Write comparison JSON
const comparison = {
  generatedAt: new Date().toISOString(),
  baselineTag: baselineResults?.tag || 'unknown',
  currentRef: currentResults?.ref || 'unknown',
  summary: {
    unchanged: results.unchanged.length,
    changed: results.changed.length,
    added: results.added.length,
    removed: results.removed.length,
    total: allKeys.size,
    baselineFailures: baselineResults?.failed || 0,
    currentFailures: currentResults?.failed || 0,
    baselineSkipped: baselineResults?.skipped || 0,
    currentSkipped: currentResults?.skipped || 0,
  },
  changed: results.changed,
  added: results.added,
  removed: results.removed,
  unchanged: results.unchanged,
}

fs.writeFileSync(path.join(outputDir, 'comparison.json'), JSON.stringify(comparison, null, 2))

// ── Generate HTML report ────────────────────────────────────

generateHTML(comparison, baselineResults, currentResults, outputDir)

console.log(`\n  ✓ Comparison complete: ${results.changed.length} changed, ${results.added.length} added, ${results.removed.length} removed, ${results.unchanged.length} unchanged`)

// ── HTML generation ─────────────────────────────────────────

function generateHTML(comparison, baselineResults, currentResults, outputDir) {
  const { changed, added, removed, unchanged, summary } = comparison
  const tag = comparison.baselineTag
  const ref = comparison.currentRef

  const hasFailures = summary.currentFailures > 0
  const hasBaselineSkips = summary.baselineSkipped > 0

  // Build feature grouping data — group all screenshots by feature name
  const featureMap = {}
  const allItems = [
    ...changed.map(i => ({ ...i, status: 'changed' })),
    ...added.map(i => ({ ...i, status: 'added' })),
    ...removed.map(i => ({ ...i, status: 'removed' })),
    ...unchanged.map(i => ({ ...i, status: 'unchanged' })),
  ]
  for (const item of allItems) {
    const feature = item.key.split('/')[0]
    if (!featureMap[feature]) featureMap[feature] = { changed: [], added: [], removed: [], unchanged: [] }
    featureMap[feature][item.status].push(item)
  }
  const featureNames = Object.keys(featureMap).sort()

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Release Screenshot Compare: ${tag} → ${ref}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; padding: 24px; }
  h1 { color: #f0f6fc; margin-bottom: 8px; font-size: 24px; }
  .subtitle { color: #8b949e; margin-bottom: 24px; font-size: 14px; }
  .summary { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
  .stat { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px 24px; min-width: 120px; }
  .stat-value { font-size: 32px; font-weight: bold; }
  .stat-label { color: #8b949e; font-size: 13px; margin-top: 4px; }
  .stat-changed .stat-value { color: #d29922; }
  .stat-added .stat-value { color: #3fb950; }
  .stat-removed .stat-value { color: #f85149; }
  .stat-unchanged .stat-value { color: #8b949e; }
  .stat-failures .stat-value { color: #f85149; }
  .view-toggle { display: flex; gap: 0; margin-bottom: 32px; }
  .view-toggle button { background: #161b22; border: 1px solid #30363d; color: #8b949e; padding: 8px 20px; font-size: 13px; cursor: pointer; transition: all 0.15s; }
  .view-toggle button:first-child { border-radius: 6px 0 0 6px; }
  .view-toggle button:last-child { border-radius: 0 6px 6px 0; border-left: none; }
  .view-toggle button.active { background: #1f6feb; color: #f0f6fc; border-color: #1f6feb; }
  .view-toggle button:hover:not(.active) { color: #f0f6fc; }
  .section { margin-bottom: 40px; }
  .section-title { font-size: 18px; color: #f0f6fc; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #30363d; }
  .comparison-card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; margin-bottom: 24px; overflow: hidden; }
  .comparison-header { padding: 12px 16px; border-bottom: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center; }
  .comparison-header h3 { font-size: 14px; color: #f0f6fc; font-family: monospace; }
  .comparison-meta { font-size: 12px; color: #8b949e; display: flex; align-items: center; gap: 8px; }
  .comparison-images { display: flex; gap: 0; }
  .comparison-images > div { flex: 1; padding: 16px; text-align: center; }
  .comparison-images > div:not(:last-child) { border-right: 1px solid #30363d; }
  .comparison-images label { display: block; font-size: 11px; text-transform: uppercase; color: #8b949e; margin-bottom: 8px; letter-spacing: 0.5px; }
  .comparison-images img { max-width: 100%; height: auto; border: 1px solid #30363d; border-radius: 4px; }
  .single-image { padding: 16px; text-align: center; }
  .single-image img { max-width: 80%; height: auto; border: 1px solid #30363d; border-radius: 4px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  .badge-changed { background: #d299221a; color: #d29922; }
  .badge-added { background: #3fb9501a; color: #3fb950; }
  .badge-removed { background: #f851491a; color: #f85149; }
  .badge-unchanged { background: #8b949e1a; color: #8b949e; }
  .badge-resized { background: #a371f71a; color: #a371f7; }
  .failures { background: #f851491a; border: 1px solid #f8514933; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  .failures h4 { color: #f85149; margin-bottom: 8px; }
  .failures pre { font-size: 12px; color: #c9d1d9; white-space: pre-wrap; word-break: break-word; max-height: 300px; overflow-y: auto; background: #0d1117; padding: 12px; border-radius: 4px; margin-top: 8px; }
  .no-changes { text-align: center; padding: 48px; color: #8b949e; }
  .no-changes p { font-size: 18px; margin-bottom: 8px; }
  .feature-link { color: #58a6ff; text-decoration: none; font-size: 12px; }
  .feature-link:hover { text-decoration: underline; }
  .feature-group { margin-bottom: 40px; }
  .feature-group-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #30363d; }
  .feature-group-header h2 { font-size: 18px; color: #f0f6fc; }
  .feature-group-badges { display: flex; gap: 6px; }
  .feature-toc { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; margin-bottom: 32px; }
  .feature-toc h3 { font-size: 14px; color: #f0f6fc; margin-bottom: 12px; }
  .feature-toc-list { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; }
  .feature-toc-list li a { display: inline-flex; align-items: center; gap: 6px; color: #58a6ff; text-decoration: none; font-size: 13px; padding: 4px 10px; background: #0d1117; border-radius: 6px; border: 1px solid #30363d; }
  .feature-toc-list li a:hover { border-color: #58a6ff; }
  .feature-toc-list .toc-dots { display: flex; gap: 3px; }
  .feature-toc-list .toc-dot { width: 8px; height: 8px; border-radius: 50%; }
  .toc-dot-changed { background: #d29922; }
  .toc-dot-added { background: #3fb950; }
  .toc-dot-removed { background: #f85149; }
  .comparison-images img, .single-image img { cursor: zoom-in; }
  .lightbox { display: none; position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.85); align-items: center; justify-content: center; flex-direction: column; cursor: zoom-out; }
  .lightbox.open { display: flex; }
  .lightbox img { max-width: 95vw; max-height: 85vh; border: 1px solid #30363d; border-radius: 6px; object-fit: contain; }
  .lightbox-label { color: #8b949e; font-size: 13px; margin-top: 10px; }
  .lightbox-hint { position: absolute; bottom: 20px; color: #484f58; font-size: 12px; }
</style>
</head>
<body>
<h1>Release Screenshot Compare</h1>
<p class="subtitle">${tag} → ${ref} · Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>

<div class="summary">
  <div class="stat stat-changed"><div class="stat-value">${summary.changed}</div><div class="stat-label">Changed</div></div>
  <div class="stat stat-added"><div class="stat-value">${summary.added}</div><div class="stat-label">Added</div></div>
  <div class="stat stat-removed"><div class="stat-value">${summary.removed}</div><div class="stat-label">Removed</div></div>
  <div class="stat stat-unchanged"><div class="stat-value">${summary.unchanged}</div><div class="stat-label">Unchanged</div></div>
  ${hasFailures ? `<div class="stat stat-failures"><div class="stat-value">${summary.currentFailures}</div><div class="stat-label">Test Failures</div></div>` : ''}
</div>

<div class="view-toggle">
  <button class="active" onclick="setView('by-status')">By Status</button>
  <button onclick="setView('by-feature')">By Feature</button>
</div>
`

  // ── By-status view (original flat view) ──

  html += `<div id="view-by-status">\n`

  // Assertion failures and skips section
  if (hasFailures || hasBaselineSkips) {
    html += `<div class="section">\n<h2 class="section-title">Test Failures &amp; Skips</h2>\n`

    if (currentResults?.failed > 0) {
      html += `<div class="failures">
<h4>Current failures (${ref}): ${currentResults.failed} feature(s)</h4>
<p style="color:#8b949e;font-size:13px;margin-bottom:8px">Failed features: ${currentResults.failedFeatures?.join(', ') || 'unknown'}</p>
<details><summary style="cursor:pointer;color:#8b949e;font-size:12px;margin-top:8px">Show Playwright output</summary>
<pre>${escapeHtml(currentResults.errors || 'No error output captured')}</pre>
</details>
</div>\n`
    }

    if (hasBaselineSkips) {
      html += `<div style="background:#3fb9501a;border:1px solid #3fb95033;border-radius:8px;padding:16px;margin-bottom:16px">
<h4 style="color:#3fb950;margin-bottom:8px">New features (not in ${tag}): ${summary.baselineSkipped}</h4>
<p style="color:#8b949e;font-size:13px">These features didn't exist at ${tag} so baseline screenshots were skipped. Their current screenshots appear as "added": ${baselineResults?.skippedFeatures?.join(', ') || 'none'}</p>
</div>\n`
    }

    html += `</div>\n`
  }

  // Changed screenshots
  if (changed.length > 0) {
    html += `<div class="section">\n<h2 class="section-title">Changed Screenshots (${changed.length})</h2>\n`
    for (const item of changed) {
      html += renderComparisonCard(item, 'changed', tag, ref)
    }
    html += `</div>\n`
  }

  // Added screenshots
  if (added.length > 0) {
    html += `<div class="section">\n<h2 class="section-title">Added Screenshots (${added.length})</h2>\n`
    for (const item of added) {
      html += renderSingleCard(item, 'added', 'current')
    }
    html += `</div>\n`
  }

  // Removed screenshots
  if (removed.length > 0) {
    html += `<div class="section">\n<h2 class="section-title">Removed Screenshots (${removed.length})</h2>\n`
    for (const item of removed) {
      html += renderSingleCard(item, 'removed', 'baseline')
    }
    html += `</div>\n`
  }

  // No visual changes
  if (changed.length === 0 && added.length === 0 && removed.length === 0 && !hasFailures) {
    html += `<div class="no-changes">
<p>No visual changes detected</p>
<p class="subtitle">All ${summary.unchanged} screenshots are identical between ${tag} and ${ref}</p>
</div>\n`
  }

  html += `</div>\n` // end view-by-status

  // ── By-feature view ──

  html += `<div id="view-by-feature" style="display:none">\n`

  // Feature table of contents
  const featuresWithChanges = featureNames.filter(f => {
    const g = featureMap[f]
    return g.changed.length > 0 || g.added.length > 0 || g.removed.length > 0
  })

  if (featuresWithChanges.length > 0) {
    html += `<div class="feature-toc"><h3>Features with changes (${featuresWithChanges.length})</h3><ul class="feature-toc-list">\n`
    for (const name of featuresWithChanges) {
      const g = featureMap[name]
      let dots = ''
      if (g.changed.length) dots += `<span class="toc-dot toc-dot-changed"></span>`
      if (g.added.length) dots += `<span class="toc-dot toc-dot-added"></span>`
      if (g.removed.length) dots += `<span class="toc-dot toc-dot-removed"></span>`
      html += `<li><a href="#feature-${name}"><span class="toc-dots">${dots}</span>${formatFeatureName(name)}</a></li>\n`
    }
    html += `</ul></div>\n`
  }

  // Test failures and skips
  if (hasFailures || hasBaselineSkips) {
    html += `<div class="section">\n<h2 class="section-title">Test Failures &amp; Skips</h2>\n`
    if (currentResults?.failed > 0) {
      html += `<div class="failures">
<h4>Current failures (${ref}): ${currentResults.failed} feature(s)</h4>
<p style="color:#8b949e;font-size:13px;margin-bottom:8px">Failed features: ${currentResults.failedFeatures?.join(', ') || 'unknown'}</p>
<details><summary style="cursor:pointer;color:#8b949e;font-size:12px;margin-top:8px">Show Playwright output</summary>
<pre>${escapeHtml(currentResults.errors || 'No error output captured')}</pre>
</details>
</div>\n`
    }
    if (hasBaselineSkips) {
      html += `<div style="background:#3fb9501a;border:1px solid #3fb95033;border-radius:8px;padding:16px;margin-bottom:16px">
<h4 style="color:#3fb950;margin-bottom:8px">New features (not in ${tag}): ${summary.baselineSkipped}</h4>
<p style="color:#8b949e;font-size:13px">These features didn't exist at ${tag} so baseline screenshots were skipped: ${baselineResults?.skippedFeatures?.join(', ') || 'none'}</p>
</div>\n`
    }
    html += `</div>\n`
  }

  // Each feature group
  for (const name of featureNames) {
    const g = featureMap[name]
    const hasChanges = g.changed.length > 0 || g.added.length > 0 || g.removed.length > 0

    // Skip features with no changes in by-feature view (they're just noise)
    if (!hasChanges) continue

    html += `<div class="feature-group" id="feature-${name}">\n`
    html += `<div class="feature-group-header"><h2>${formatFeatureName(name)}</h2><div class="feature-group-badges">`
    if (g.changed.length) html += `<span class="badge badge-changed">${g.changed.length} changed</span>`
    if (g.added.length) html += `<span class="badge badge-added">${g.added.length} added</span>`
    if (g.removed.length) html += `<span class="badge badge-removed">${g.removed.length} removed</span>`
    if (g.unchanged.length) html += `<span class="badge badge-unchanged">${g.unchanged.length} unchanged</span>`
    html += `</div></div>\n`

    for (const item of g.changed) {
      html += renderComparisonCard(item, 'changed', tag, ref)
    }
    for (const item of g.added) {
      html += renderSingleCard(item, 'added', 'current')
    }
    for (const item of g.removed) {
      html += renderSingleCard(item, 'removed', 'baseline')
    }

    html += `</div>\n`
  }

  // No changes message for feature view
  if (featuresWithChanges.length === 0 && !hasFailures) {
    html += `<div class="no-changes">
<p>No visual changes detected</p>
<p class="subtitle">All ${summary.unchanged} screenshots across ${featureNames.length} features are identical between ${tag} and ${ref}</p>
</div>\n`
  }

  html += `</div>\n` // end view-by-feature

  // View toggle script
  html += `
<div class="lightbox" id="lightbox" onclick="closeLightbox()">
  <img id="lightbox-img" src="" alt="">
  <div class="lightbox-label" id="lightbox-label"></div>
  <div class="lightbox-hint">Click anywhere or press Escape to close</div>
</div>

<script>
function setView(view) {
  document.getElementById('view-by-status').style.display = view === 'by-status' ? '' : 'none';
  document.getElementById('view-by-feature').style.display = view === 'by-feature' ? '' : 'none';
  document.querySelectorAll('.view-toggle button').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.toLowerCase().includes(view.replace('by-', '')));
  });
  history.replaceState(null, '', '#' + view);
}
// Restore view from URL hash
if (location.hash === '#by-feature') setView('by-feature');

function openLightbox(img, label) {
  event.stopPropagation();
  var lb = document.getElementById('lightbox');
  document.getElementById('lightbox-img').src = img.src;
  document.getElementById('lightbox-label').textContent = label;
  lb.classList.add('open');
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
}
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeLightbox();
});
</script>\n`

  html += `</body>\n</html>\n`

  fs.writeFileSync(path.join(outputDir, 'index.html'), html)
}

function renderComparisonCard(item, status, tag, ref) {
  const feature = item.key.split('/')[0]
  const resizedBadge = item.dimensionsChanged
    ? `<span class="badge badge-resized">${item.baselineSize.width}×${item.baselineSize.height} → ${item.currentSize.width}×${item.currentSize.height}</span>`
    : ''

  const shotId = screenshotId(item.key)
  return `<div class="comparison-card" id="${shotId}">
<div class="comparison-header">
  <h3>${item.key}</h3>
  <div class="comparison-meta">
    <a class="feature-link" href="#feature-${feature}" onclick="setView('by-feature')">${formatFeatureName(feature)}</a>
    <span class="badge badge-changed">${item.diffPercent}% diff</span>${resizedBadge}
  </div>
</div>
<div class="comparison-images">
  <div><label>Baseline (${tag})</label><img src="baseline/${item.key}" alt="baseline" loading="lazy" onclick="openLightbox(this,'Baseline: ${item.key}')"></div>
  <div><label>Current (${ref})</label><img src="current/${item.key}" alt="current" loading="lazy" onclick="openLightbox(this,'Current: ${item.key}')"></div>
  <div><label>Diff</label><img src="${item.diffPath}" alt="diff" loading="lazy" onclick="openLightbox(this,'Diff: ${item.key}')"></div>
</div>
</div>\n`
}

function renderSingleCard(item, status, imgDir) {
  const feature = item.key.split('/')[0]
  const shotId = screenshotId(item.key)
  return `<div class="comparison-card" id="${shotId}">
<div class="comparison-header">
  <h3>${item.key}</h3>
  <div class="comparison-meta">
    <a class="feature-link" href="#feature-${feature}" onclick="setView('by-feature')">${formatFeatureName(feature)}</a>
    <span class="badge badge-${status}">${status === 'added' ? 'new' : 'removed'}</span>
  </div>
</div>
<div class="single-image"><img src="${imgDir}/${item.key}" alt="${status}" loading="lazy" onclick="openLightbox(this,'${item.key}')"></div>
</div>\n`
}

function screenshotId(key) {
  return 'shot-' + key.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').replace(/-$/, '')
}

function formatFeatureName(slug) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Terminal color helpers
function dim(s) { return `\x1b[2m${s}\x1b[0m` }
function yellow(s) { return `\x1b[33m${s}\x1b[0m` }
function green(s) { return `\x1b[32m${s}\x1b[0m` }
function red(s) { return `\x1b[31m${s}\x1b[0m` }
