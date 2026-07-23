/**
 * Feature Documentation: Session Repo Groups
 *
 * Sessions cluster under collapsible per-repo headers (sorted alphabetically); each
 * group can be collapsed, rolling its status onto the header, and search flattens the
 * list. Captures screenshots of each stage.
 *
 * Run with: pnpm test:feature-docs session-repo-groups
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { screenshotElement } from '../_shared/screenshot-helpers'
import { generateFeaturePage, generateIndex, FeatureStep } from '../_shared/template'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FEATURE_DIR = __dirname
const SCREENSHOTS = path.join(FEATURE_DIR, 'screenshots')
const FEATURES_ROOT = path.join(__dirname, '..')

let page: Page
const steps: FeatureStep[] = []

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Session Repo Groups',
      description:
        'Sessions are grouped by their repository under collapsible headers, sorted alphabetically ' +
        '(repo name, then branch). A vivid per-repo rail runs beside each group, while colour is ' +
        'reserved for the status LEDs. Collapsing a group rolls its highest-priority status onto the ' +
        'header so nothing is hidden, and searching flattens the list with a neutral repo tag.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Session Repo Groups', () => {
  test('Step 1: Sessions grouped under repo headers', async () => {
    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await expect(sidebar).toBeVisible()

    // The broomy session (repoId repo-1) clusters under a "demo-project" group header.
    const repoHeader = page.locator('[aria-expanded][aria-label*="demo-project"]')
    await expect(repoHeader).toBeVisible()
    await expect(page.locator('.cursor-pointer:has-text("broomy")')).toBeVisible()

    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '01-grouped.png'), { maxHeight: 600 })
    steps.push({
      screenshotPath: 'screenshots/01-grouped.png',
      caption: 'Sessions grouped by repo, sorted alphabetically',
      description:
        'Each repo is a collapsible header (name + session count) with its sessions indented behind ' +
        'a vivid colour rail. Sessions with no repo fall under a "No repo" group.',
    })
  })

  test('Step 2: Collapse a group — its cards hide, status rolls up', async () => {
    const repoHeader = page.locator('[aria-expanded][aria-label*="demo-project"]')
    await repoHeader.click()
    await expect(repoHeader).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('.cursor-pointer:has-text("broomy")')).toBeHidden()

    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '02-collapsed.png'), { maxHeight: 600 })
    steps.push({
      screenshotPath: 'screenshots/02-collapsed.png',
      caption: 'A collapsed group keeps you in control without hiding status',
      description:
        'Clicking a header collapses the group and hides its cards. The collapse state persists per ' +
        'profile; if a collapsed group holds a working/unread/error session, that status rolls up onto ' +
        'the header, so nothing important is ever hidden.',
    })
  })

  test('Step 3: Expand it again', async () => {
    const repoHeader = page.locator('[aria-expanded][aria-label*="demo-project"]')
    await repoHeader.click()
    await expect(repoHeader).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('.cursor-pointer:has-text("broomy")')).toBeVisible()

    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '03-expanded.png'), { maxHeight: 600 })
    steps.push({
      screenshotPath: 'screenshots/03-expanded.png',
      caption: 'Expanding restores the group',
      description: 'Clicking the header again re-opens the group and its cards return.',
    })
  })

  test('Step 4: Search flattens the list with a neutral repo tag', async () => {
    const search = page.locator('[data-session-search]')
    await search.fill('broomy')
    await expect(page.locator('[aria-expanded][aria-label*="demo-project"]')).toHaveCount(0)

    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '04-search.png'), { maxHeight: 600 })
    steps.push({
      screenshotPath: 'screenshots/04-search.png',
      caption: 'Searching flattens to a filtered list',
      description:
        'While searching, grouping is suspended: results become a flat filtered list, each tagged with ' +
        'its repo name (a neutral text tag), so a match is never hidden inside a collapsed group.',
    })
    await search.fill('')
  })
})
