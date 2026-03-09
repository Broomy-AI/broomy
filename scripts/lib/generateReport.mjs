import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { dirname, resolve, relative } from 'path'

/**
 * Generate a self-contained HTML report for screenshot comparison results.
 * @param {Array<{storyId: string, diffPixels: number, totalPixels: number, diffPercent: number, status: string}>} results
 * @param {string} reportPath - Output HTML file path
 * @param {string} screenshotsDir - Directory with current screenshots
 * @param {string} refsDir - Directory with reference screenshots
 * @param {string} diffsDir - Directory with diff images
 */
export function generateReport(results, reportPath, screenshotsDir, refsDir, diffsDir) {
  const reportDir = dirname(reportPath)
  mkdirSync(reportDir, { recursive: true })

  const passed = results.filter(r => r.status === 'pass').length
  const failed = results.filter(r => r.status === 'fail').length
  const newCount = results.filter(r => r.status === 'new').length
  const total = results.length

  const toRelative = (dir, file) => {
    const abs = resolve(dir, file)
    return existsSync(abs) ? relative(reportDir, abs) : null
  }

  const rows = results
    .sort((a, b) => {
      // Failed first, then new, then passed
      const order = { fail: 0, new: 1, pass: 2 }
      return (order[a.status] ?? 3) - (order[b.status] ?? 3)
    })
    .map(r => {
      const refImg = toRelative(refsDir, `${r.storyId}.png`)
      const curImg = toRelative(screenshotsDir, `${r.storyId}.png`)
      const diffImg = toRelative(diffsDir, `${r.storyId}-diff.png`)

      const statusColor = r.status === 'pass' ? '#4ade80' : r.status === 'fail' ? '#f87171' : '#facc15'
      const statusLabel = r.status.toUpperCase()

      return `
    <div class="story">
      <div class="story-header">
        <span class="status" style="color:${statusColor}">${statusLabel}</span>
        <span class="story-id">${r.storyId}</span>
        <span class="diff-pct">${r.diffPercent.toFixed(3)}%</span>
      </div>
      <div class="images">
        <div class="img-col">
          <div class="img-label">Reference</div>
          ${refImg ? `<img src="${refImg}" />` : '<div class="no-img">No reference</div>'}
        </div>
        <div class="img-col">
          <div class="img-label">Current</div>
          ${curImg ? `<img src="${curImg}" />` : '<div class="no-img">No screenshot</div>'}
        </div>
        <div class="img-col">
          <div class="img-label">Diff</div>
          ${diffImg && r.status !== 'new' ? `<img src="${diffImg}" />` : '<div class="no-img">N/A</div>'}
        </div>
      </div>
    </div>`
    })
    .join('\n')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Storybook Screenshot Report</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #1a1a1a; color: #e0e0e0; font-family: -apple-system, sans-serif; padding: 20px; }
  h1 { margin-bottom: 10px; }
  .summary { margin-bottom: 20px; font-size: 14px; color: #a0a0a0; }
  .summary span { margin-right: 16px; }
  .pass-count { color: #4ade80; }
  .fail-count { color: #f87171; }
  .new-count { color: #facc15; }
  .story { border: 1px solid #3a3a3a; border-radius: 8px; margin-bottom: 16px; overflow: hidden; }
  .story-header { display: flex; align-items: center; gap: 12px; padding: 10px 16px; background: #252525; }
  .status { font-weight: 700; font-size: 12px; text-transform: uppercase; }
  .story-id { flex: 1; font-family: monospace; font-size: 13px; }
  .diff-pct { font-size: 12px; color: #a0a0a0; }
  .images { display: flex; gap: 4px; padding: 8px; }
  .img-col { flex: 1; text-align: center; }
  .img-label { font-size: 11px; color: #a0a0a0; margin-bottom: 4px; }
  .img-col img { max-width: 100%; border: 1px solid #3a3a3a; border-radius: 4px; }
  .no-img { padding: 40px; color: #6b7280; font-size: 12px; border: 1px dashed #3a3a3a; border-radius: 4px; }
</style>
</head>
<body>
<h1>Screenshot Comparison Report</h1>
<div class="summary">
  <span>Total: ${total}</span>
  <span class="pass-count">Passed: ${passed}</span>
  <span class="fail-count">Failed: ${failed}</span>
  <span class="new-count">New: ${newCount}</span>
</div>
${rows}
</body>
</html>`

  writeFileSync(reportPath, html)
}
