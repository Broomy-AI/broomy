#!/usr/bin/env node
/**
 * Fails if the renderer reaches past the design tokens.
 *
 * The palette resolves through CSS custom properties so the app can be rethemed
 * without touching a component (see src/renderer/index.css). A raw
 * `text-red-400` opts out of that: it is hardcoded for a dark background and
 * cannot follow a theme. One of those is a bug; five hundred of them is a
 * rewrite, which is what this codebase had accumulated.
 *
 * Without this check the migration is a snapshot, not a guarantee.
 *
 * Banned, in className strings under src/renderer:
 *   - raw Tailwind colour families      text-red-400, bg-neutral-800, border-zinc-700
 *   - arbitrary colour values           bg-[#1a1a1a]
 *   - arbitrary font sizes              text-[10px]   (they cannot follow --app-text-scale)
 *
 * Inline `style={{ backgroundColor: agent.color }}` is untouched — agent and
 * profile colours are user data, not theme.
 */
const { execSync } = require('child_process')

const FAMILIES = [
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
  'white', 'black',
].join('|')

const PROPS = 'bg|text|border|ring|fill|stroke|divide|placeholder|from|to|via|outline|shadow|decoration|caret|accent'

const RULES = [
  {
    name: 'raw Tailwind colour',
    pattern: `\\b(${PROPS})-(${FAMILIES})(-[0-9]{2,3})?\\b`,
    hint: 'use a semantic token (text-danger-fg, bg-surface-hover, border-border, …)',
  },
  {
    name: 'arbitrary colour value',
    pattern: `\\b(${PROPS})-\\[#[0-9a-fA-F]{3,8}\\]`,
    hint: 'add a token to src/shared/theme.ts and index.css instead',
  },
  {
    name: 'arbitrary font size',
    pattern: `\\btext-\\[[0-9]+px\\]`,
    hint: 'use text-micro / text-3xs / text-2xs — they follow --app-text-scale, a raw px size cannot',
  },
]

let failed = 0

for (const rule of RULES) {
  let out = ''
  try {
    out = execSync(
      `rg --line-number --no-heading -o "${rule.pattern}" src/renderer`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim()
  } catch {
    continue // rg exits 1 when there are no matches, which is the passing case
  }
  if (!out) continue

  const lines = out.split('\n')
  failed += lines.length
  console.error(`\n✗ ${lines.length} ${rule.name}${lines.length === 1 ? '' : 's'} — ${rule.hint}`)
  for (const line of lines.slice(0, 20)) console.error(`    ${line}`)
  if (lines.length > 20) console.error(`    … and ${lines.length - 20} more`)
}

if (failed > 0) {
  console.error(`\n${failed} hardcoded colour/size value(s) bypass the design tokens.`)
  console.error('See docs/style-guide.md for the token list.\n')
  process.exit(1)
}

console.log('check-colors: no hardcoded colours or font sizes in the renderer')
