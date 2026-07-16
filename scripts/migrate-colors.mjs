#!/usr/bin/env node
/**
 * One-shot migration: raw Tailwind colour classes -> semantic role tokens.
 *
 * Not part of the build. Committed only so the mapping is reviewable and the
 * migration is reproducible rather than a pile of hand-edited files.
 *
 * The mapping is deliberately 1:1 on VALUE — every token is given the exact hex
 * of the Tailwind shade it replaces — so the migration cannot move a pixel. The
 * point is to change the *vocabulary*, not the colours; retheming happens later,
 * by giving these tokens different values per theme.
 *
 * Usage: node scripts/migrate-colors.mjs --family=danger [--dry]
 */
import { readFileSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'

// Tailwind v3 shade -> semantic tier. The tiers are the slots the app actually
// uses: soft/fg for text, base for tints and borders, solid for button fills,
// deep for the dark tinted backgrounds of banners.
export const FAMILIES = {
  danger: {
    hue: 'red',
    tiers: { 300: 'soft', 400: 'fg', 500: 'base', 600: 'solid', 800: 'deeper', 900: 'deep' },
    hex: { 300: '#fca5a5', 400: '#f87171', 500: '#ef4444', 600: '#dc2626', 800: '#991b1b', 900: '#7f1d1d' },
  },
  warning: {
    hue: 'yellow',
    tiers: { 200: 'subtle', 300: 'soft', 400: 'fg', 500: 'base', 600: 'solid', 700: 'strong', 900: 'deep' },
    hex: { 200: '#fef08a', 300: '#fde047', 400: '#facc15', 500: '#eab308', 600: '#ca8a04', 700: '#a16207', 900: '#713f12' },
  },
  success: {
    hue: 'green',
    tiers: { 300: 'soft', 400: 'fg', 500: 'base', 600: 'solid', 900: 'deep' },
    hex: { 300: '#86efac', 400: '#4ade80', 500: '#22c55e', 600: '#16a34a', 900: '#14532d' },
  },
  info: {
    hue: 'blue',
    tiers: { 200: 'subtle', 300: 'soft', 400: 'fg', 500: 'base', 600: 'solid', 700: 'strong', 900: 'deep' },
    hex: { 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 900: '#1e3a8a' },
  },
  review: {
    hue: 'purple',
    tiers: { 400: 'fg', 500: 'base', 600: 'solid', 700: 'strong', 900: 'deep' },
    hex: { 400: '#c084fc', 500: '#a855f7', 600: '#9333ea', 700: '#7e22ce', 900: '#581c87' },
  },
  // Kept as its own role rather than folded into `warning`: orange is the
  // PR-feedback signal, and collapsing it into yellow would make it identical to
  // modified-file yellow AND the agent-waiting dot — three meanings, one colour,
  // in the sidebar this app is scanned by all day.
  attention: {
    hue: 'orange',
    tiers: { 400: 'fg', 500: 'base', 600: 'solid' },
    hex: { 400: '#fb923c', 500: '#f97316', 600: '#ea580c' },
  },
  note: {
    hue: 'cyan',
    tiers: { 400: 'fg', 500: 'base' },
    hex: { 400: '#22d3ee', 500: '#06b6d4' },
  },
}

const PROPS = ['bg', 'text', 'border', 'ring', 'fill', 'stroke', 'divide', 'placeholder', 'from', 'to', 'via']

/**
 * Neutrals cannot be mapped by shade the way the hues can: the app reaches for
 * `neutral`, `zinc` AND `gray` at overlapping steps, so several near-identical
 * greys are doing the same job. These are listed explicitly rather than generated.
 *
 * `exact` entries have the same value as the token they map to, so they cannot
 * move a pixel. `unify` entries deliberately collapse near-duplicate greys onto
 * one semantic token, which DOES move pixels — that is the point, and it is
 * committed separately with its reference screenshots.
 */
export const NEUTRALS = {
  exact: [
    // #ffffff === on-accent. These are labels sitting on a saturated fill.
    ['text-white', 'text-on-accent'],
    // #000000 === overlay. The modal scrim, which stays dark in every theme.
    ['bg-black', 'bg-overlay'],
    // #ffffff === elevate. A white wash over a dark surface — in a light theme
    // this must become a black wash, which is exactly what the token buys.
    ['bg-white', 'bg-elevate'],
    // #404040 === surface-hover, exactly.
    ['bg-neutral-700', 'bg-surface-hover'],
  ],
  unify: [
    // Near-white text -> text-primary (#e0e0e0)
    ['text-neutral-100', 'text-text-primary'],
    ['text-neutral-200', 'text-text-primary'],
    ['text-neutral-300', 'text-text-primary'],
    ['text-zinc-300', 'text-text-primary'],
    // Mid grey text -> text-secondary (#a0a0a0)
    ['text-neutral-400', 'text-text-secondary'],
    ['text-zinc-400', 'text-text-secondary'],
    ['text-gray-400', 'text-text-secondary'],
    // Dim grey text -> text-tertiary (#949494). These were #737373/#71717a, only
    // 3.35:1 on bg-primary — an existing WCAG AA failure. The token is 5.74:1, so
    // this both unifies the vocabulary and fixes the contrast.
    ['text-neutral-500', 'text-text-tertiary'],
    ['text-zinc-500', 'text-text-tertiary'],
    ['text-neutral-600', 'text-text-tertiary'],
    ['placeholder-neutral-500', 'placeholder-text-tertiary'],
    // Surfaces
    ['bg-neutral-900', 'bg-bg-primary'],
    ['bg-zinc-900', 'bg-bg-primary'],
    ['bg-neutral-800', 'bg-bg-secondary'],
    ['bg-zinc-800', 'bg-bg-secondary'],
    ['bg-zinc-700', 'bg-surface-hover'],
    ['bg-neutral-600', 'bg-muted'],
    ['bg-neutral-500', 'bg-muted'],
    ['bg-zinc-500', 'bg-muted'],
    ['bg-gray-500', 'bg-muted'],
    // Lines
    ['border-neutral-700', 'border-border'],
    ['border-zinc-800', 'border-border'],
    ['border-neutral-600', 'border-border-strong'],
    ['border-neutral-500', 'border-border-strong'],
  ],
}

export function neutralRules(kind) {
  // \b won't do: these classes carry alpha modifiers (bg-black/50) and variants
  // (hover:bg-neutral-700), so anchor on the class boundary instead.
  return NEUTRALS[kind].map(([from, to]) => [
    new RegExp(`(?<![\\w-])${from}(?![\\w-])`, 'g'),
    to,
  ])
}

/** Every rewrite this family performs, as [pattern, replacement] pairs. */
export function rulesFor(family) {
  const { hue, tiers } = FAMILIES[family]
  const rules = []
  for (const [shade, tier] of Object.entries(tiers)) {
    for (const prop of PROPS) {
      // Keep any alpha modifier intact: bg-red-500/20 -> bg-danger-base/20
      rules.push([
        new RegExp(`\\b${prop}-${hue}-${shade}\\b`, 'g'),
        `${prop}-${family}-${tier}`,
      ])
    }
  }
  return rules
}

function main() {
  const family = (process.argv.find((a) => a.startsWith('--family=')) || '').split('=')[1]
  const dry = process.argv.includes('--dry')
  const isNeutral = family === 'neutral-exact' || family === 'neutral-unify'
  if (!FAMILIES[family] && !isNeutral) {
    console.error(
      `Usage: node scripts/migrate-colors.mjs --family=<${Object.keys(FAMILIES).join('|')}|neutral-exact|neutral-unify> [--dry]`
    )
    process.exit(1)
  }

  const rules = isNeutral
    ? neutralRules(family === 'neutral-exact' ? 'exact' : 'unify')
    : rulesFor(family)
  const files = execSync('rg -l --glob "*.tsx" --glob "*.ts" "" src/renderer', { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean)

  let changed = 0
  let hits = 0
  for (const file of files) {
    const before = readFileSync(file, 'utf8')
    let after = before
    for (const [re, to] of rules) {
      after = after.replace(re, () => { hits++; return to })
    }
    if (after !== before) {
      changed++
      if (!dry) writeFileSync(file, after)
    }
  }
  console.log(`${family}: ${hits} class${hits === 1 ? '' : 'es'} rewritten across ${changed} file(s)${dry ? ' (dry run)' : ''}`)
}

if (process.argv[1] && process.argv[1].endsWith('migrate-colors.mjs')) main()
