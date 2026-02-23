import fs from 'fs'
import path from 'path'

export interface FeatureStep {
  /** Relative path to the screenshot file (from the feature directory) */
  screenshotPath: string
  /** Short caption describing what this screenshot shows */
  caption: string
  /** Optional longer explanation */
  description?: string
}

export interface FeatureDoc {
  /** Feature title */
  title: string
  /** Overview description of the feature */
  description: string
  /** Ordered steps with screenshots */
  steps: FeatureStep[]
}

/**
 * Generate an HTML documentation page for a feature.
 * Writes index.html in the given featureDir.
 */
export async function generateFeaturePage(doc: FeatureDoc, featureDir: string): Promise<void> {
  const timestamp = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')

  const stepsHtml = doc.steps
    .map(
      (step, i) => `
    <div class="step">
      <h3>Step ${i + 1}: ${escapeHtml(step.caption)}</h3>
      ${step.description ? `<p>${escapeHtml(step.description)}</p>` : ''}
      <img src="${escapeHtml(step.screenshotPath)}" alt="Step ${i + 1}: ${escapeHtml(step.caption)}" />
    </div>`,
    )
    .join('\n')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(doc.title)} — Feature Documentation</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a2e; background: #f8f9fa; padding: 2rem; max-width: 960px; margin: 0 auto; }
    h1 { font-size: 1.8rem; margin-bottom: 0.5rem; }
    .description { color: #555; margin-bottom: 2rem; font-size: 1.05rem; }
    .step { margin-bottom: 2.5rem; background: #fff; border-radius: 8px; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .step h3 { font-size: 1.1rem; margin-bottom: 0.5rem; color: #2d3748; }
    .step p { color: #666; margin-bottom: 1rem; }
    .step img { max-width: 100%; border-radius: 6px; border: 1px solid #e2e8f0; }
    .meta { color: #999; font-size: 0.85rem; margin-top: 2rem; border-top: 1px solid #eee; padding-top: 1rem; }
    a { color: #4a6cf7; }
  </style>
</head>
<body>
  <p><a href="../index.html">All Features</a></p>
  <h1>${escapeHtml(doc.title)}</h1>
  <p class="description">${escapeHtml(doc.description)}</p>
  ${stepsHtml}
  <p class="meta">Generated ${timestamp}</p>
</body>
</html>`

  await fs.promises.writeFile(path.join(featureDir, 'index.html'), html, 'utf-8')
}

/**
 * Auto-scan tests/features/ and generate a top-level index.html linking to all feature pages.
 */
export async function generateIndex(featuresDir: string): Promise<void> {
  const entries = await fs.promises.readdir(featuresDir, { withFileTypes: true })
  const features: { slug: string; title: string }[] = []

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue
    const indexPath = path.join(featuresDir, entry.name, 'index.html')
    try {
      const html = await fs.promises.readFile(indexPath, 'utf-8')
      const titleMatch = html.match(/<h1>(.*?)<\/h1>/)
      features.push({
        slug: entry.name,
        title: titleMatch ? titleMatch[1] : entry.name,
      })
    } catch {
      // No index.html yet — skip
    }
  }

  features.sort((a, b) => a.title.localeCompare(b.title))

  const listHtml = features.length
    ? features.map((f) => `    <li><a href="${f.slug}/index.html">${escapeHtml(f.title)}</a></li>`).join('\n')
    : '    <li>No feature docs generated yet. Run <code>pnpm test:feature-docs</code>.</li>'

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Feature Documentation</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a2e; background: #f8f9fa; padding: 2rem; max-width: 960px; margin: 0 auto; }
    h1 { font-size: 1.8rem; margin-bottom: 1.5rem; }
    ul { list-style: none; }
    li { margin-bottom: 0.75rem; background: #fff; border-radius: 8px; padding: 1rem 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    a { color: #4a6cf7; text-decoration: none; font-weight: 500; font-size: 1.05rem; }
    a:hover { text-decoration: underline; }
    code { background: #e2e8f0; padding: 0.15rem 0.4rem; border-radius: 3px; font-size: 0.9rem; }
    .meta { color: #999; font-size: 0.85rem; margin-top: 2rem; border-top: 1px solid #eee; padding-top: 1rem; }
  </style>
</head>
<body>
  <h1>Feature Documentation</h1>
  <ul>
${listHtml}
  </ul>
  <p class="meta">Generated ${new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')}</p>
</body>
</html>`

  await fs.promises.writeFile(path.join(featuresDir, 'index.html'), html, 'utf-8')
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
