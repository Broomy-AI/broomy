#!/usr/bin/env node
/**
 * Copy current screenshots to the reference directory.
 */
import { existsSync, mkdirSync, readdirSync, copyFileSync } from 'fs'
import { resolve, join } from 'path'

const ROOT = resolve(import.meta.dirname, '..')
const SCREENSHOTS_DIR = join(ROOT, '.storybook-screenshots')
const REFS_DIR = process.env.STORYBOOK_REFS_DIR || join(ROOT, '.storybook-refs')

if (!existsSync(SCREENSHOTS_DIR)) {
  console.error('No screenshots found. Run pnpm storybook:test first.')
  process.exit(1)
}

mkdirSync(REFS_DIR, { recursive: true })

const files = readdirSync(SCREENSHOTS_DIR).filter(f => f.endsWith('.png'))
let updated = 0
let added = 0

for (const file of files) {
  const src = join(SCREENSHOTS_DIR, file)
  const dest = join(REFS_DIR, file)
  const isNew = !existsSync(dest)
  copyFileSync(src, dest)
  if (isNew) added++
  else updated++
}

console.log(`References updated: ${updated} updated, ${added} new (total: ${files.length})`)
