/**
 * Feature Documentation: Drag to Reorder Sessions and Repo Groups
 *
 * Session cards can be dragged to reorder them within their own repo group, and
 * repo group headers can be dragged to reorder the groups. A 2px accent drop
 * line shows above or below the hovered target depending on which vertical
 * half the cursor is in. Dropping a session card onto a different repo group
 * is rejected — cross-group drops have no unambiguous position — and, since the
 * drop will never land, no drop-indicator line appears while hovering over a
 * card in another group either. Dragging is disabled while the search box has
 * a query.
 *
 * Playwright can't drive native OS drag-and-drop, so each drag is performed by
 * dispatching synthetic DragEvents (dragstart → dragover → drop → dragend)
 * directly at the card/header elements — the same pattern used by the
 * drop-file-to-terminal feature doc — which exercises the real onDragStart/
 * onDragOver/onDrop/onDragEnd handlers wired in RepoGroupSection.tsx.
 *
 * Run with: pnpm test:feature-docs sidebar-drag-order
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

/**
 * Drag one sidebar element onto another by dispatching real DragEvents, the way
 * drop-file-to-terminal drives a native-drag-only interaction. Each event fires in
 * its own `page.evaluate` call (with a tick in between) so React's `useState`
 * updates from one handler (e.g. dragstart's `setDragging`) commit before the next
 * event's handler closure runs — dispatching them all synchronously in one browser
 * task would leave later handlers reading stale state. `beforeDrop` runs after
 * dragover (so a mid-drag screenshot can capture the drop-indicator line) and
 * before drop/dragend fire.
 */
type DragHandle = { dt: DataTransfer; from: HTMLElement; to: HTMLElement }

/** Does `to` currently show the accent drop-indicator line (top or bottom edge)? */
function dispatchDragOverAndCheckIndicator(p: Page, towardTop: boolean): Promise<boolean> {
  return p.evaluate((towardTop) => {
    const { dt, to } = (window as unknown as { __drag: DragHandle }).__drag
    const rect = to.getBoundingClientRect()
    const clientY = towardTop ? rect.top + 2 : rect.bottom - 2
    to.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientY }))
    return to.className.includes('border-t-accent') || to.className.includes('border-b-accent')
  }, towardTop)
}


async function dragElement(
  p: Page,
  fromSelector: string,
  toSelector: string,
  opts: { towardTop?: boolean; beforeDrop?: () => Promise<void> } = {},
): Promise<void> {
  const { towardTop = true, beforeDrop } = opts

  await p.evaluate(
    ({ fromSelector, toSelector }) => {
      const from = document.querySelector(fromSelector) as HTMLElement | null
      const to = document.querySelector(toSelector) as HTMLElement | null
      if (!from || !to) throw new Error(`drag source/target not found: ${fromSelector} / ${toSelector}`)
      const dt = new DataTransfer()
      ;(window as unknown as { __drag: DragHandle }).__drag = { dt, from, to }
      from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
    },
    { fromSelector, toSelector },
  )

  // Re-dispatch dragover on each poll tick until the drop-indicator class shows up —
  // that's the observable signal that dragstart's `setDragging` React state update
  // has committed (a single same-tick dragover can fire before it does).
  await expect.poll(() => dispatchDragOverAndCheckIndicator(p, towardTop), { timeout: 2000 }).toBe(true)

  if (beforeDrop) await beforeDrop()

  await p.evaluate((towardTop) => {
    const { dt, from, to } = (window as unknown as { __drag: DragHandle }).__drag
    const rect = to.getBoundingClientRect()
    const clientY = towardTop ? rect.top + 2 : rect.bottom - 2
    to.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientY }))
    from.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }))
  }, towardTop)

  // The drop/dragend handlers clear the indicator (setDropTarget(null)); wait for
  // that state to commit so callers see the post-drop DOM.
  await expect
    .poll(() =>
      p.evaluate(() => {
        const { to } = (window as unknown as { __drag: DragHandle }).__drag
        return to.className.includes('border-t-accent') || to.className.includes('border-b-accent')
      }),
    )
    .toBe(false)
}

/**
 * Drag `from` onto `to` when `to` belongs to a different repo group: the drop indicator
 * must never appear over `to`, and the drop itself must be a no-op.
 *
 * There's nothing to poll for directly on `to` (a cross-group dragover never shows the
 * indicator, so there's no "it happened" signal to wait on there, unlike `dragElement`).
 * Instead this first hovers `decoySelector` — another card in `from`'s own group — and
 * polls its indicator the same way `dragElement` does; that's the signal that
 * dragstart's `setDragging` React state has committed. Only then does it redirect the
 * drag to the real (cross-group) `to` and assert its indicator stays absent.
 */
async function dragElementExpectRejected(
  p: Page,
  fromSelector: string,
  decoySelector: string,
  toSelector: string,
): Promise<void> {
  await p.evaluate(
    ({ fromSelector, decoySelector }) => {
      const from = document.querySelector(fromSelector) as HTMLElement | null
      const decoy = document.querySelector(decoySelector) as HTMLElement | null
      if (!from || !decoy) throw new Error(`drag source/decoy not found: ${fromSelector} / ${decoySelector}`)
      const dt = new DataTransfer()
      ;(window as unknown as { __drag: DragHandle }).__drag = { dt, from, to: decoy }
      from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
    },
    { fromSelector, decoySelector },
  )

  await expect.poll(() => dispatchDragOverAndCheckIndicator(p, true), { timeout: 2000 }).toBe(true)

  const hasIndicator = await p.evaluate((toSelector) => {
    const to = document.querySelector(toSelector) as HTMLElement | null
    if (!to) throw new Error(`drag target not found: ${toSelector}`)
    ;(window as unknown as { __drag: DragHandle }).__drag.to = to
    const { dt } = (window as unknown as { __drag: DragHandle }).__drag
    const rect = to.getBoundingClientRect()
    to.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: rect.top + 2 }))
    return to.className.includes('border-t-accent') || to.className.includes('border-b-accent')
  }, toSelector)
  expect(hasIndicator).toBe(false)

  await p.evaluate(() => {
    const { dt, from, to } = (window as unknown as { __drag: DragHandle }).__drag
    const rect = to.getBoundingClientRect()
    to.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: rect.top + 2 }))
    from.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }))
  })
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Drag to Reorder Sessions and Repo Groups',
      description:
        'Session cards can be dragged to reorder them within their own repo group — order is ' +
        'persisted and new sessions always append at the bottom. Repo group headers can be dragged ' +
        'to reorder the groups themselves. A 2px accent line shows above or below the hovered card ' +
        'or header depending on which half the cursor is in. Dropping a session onto a different ' +
        'repo group is rejected — the drop has no unambiguous position across groups. Archived ' +
        'sessions are never draggable; they always sort most-recently-archived first.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Drag to Reorder Sessions and Repo Groups', () => {
  test('Step 1: Sessions with no repo start in array order', async () => {
    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await expect(sidebar).toBeVisible()

    // backend-api and docs-site have no repoId and cluster under "No repo".
    const backendCard = page.locator('[data-session-id="2"]')
    const docsCard = page.locator('[data-session-id="3"]')
    await expect(backendCard).toBeVisible()
    await expect(docsCard).toBeVisible()
    const backendBox = await backendCard.boundingBox()
    const docsBox = await docsCard.boundingBox()
    expect(backendBox!.y).toBeLessThan(docsBox!.y)

    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '01-initial-order.png'), { maxHeight: 500 })
    steps.push({
      screenshotPath: 'screenshots/01-initial-order.png',
      caption: 'Sessions sit in the order they were added',
      description:
        'backend-api and docs-site have no repo and cluster under "No repo". They start in array ' +
        'order — the order sessions are persisted in, not alphabetical.',
    })
  })

  test('Step 2: Dragging a session card shows a drop indicator', async () => {
    // Drag docs-site over the top half of backend-api — hovering should show the
    // drop line before anything is dropped.
    await dragElement(page, '[data-session-id="3"]', '[data-session-id="2"]', {
      towardTop: true,
      beforeDrop: async () => {
        const backendCard = page.locator('[data-session-id="2"]')
        await expect(backendCard).toHaveClass(/border-t-accent/)
        const sidebar = page.locator('[data-panel-id="sidebar"]')
        await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '02-drop-indicator.png'), { maxHeight: 500 })
        steps.push({
          screenshotPath: 'screenshots/02-drop-indicator.png',
          caption: 'A 2px accent line marks where the card will land',
          description:
            'While dragging docs-site over the top half of backend-api, a line appears above ' +
            'backend-api. The line switches to below the card when the cursor crosses its ' +
            'vertical midpoint.',
        })
      },
    })

    const backendCard = page.locator('[data-session-id="2"]')
    const docsCard = page.locator('[data-session-id="3"]')
    const backendBox = await backendCard.boundingBox()
    const docsBox = await docsCard.boundingBox()
    expect(docsBox!.y).toBeLessThan(backendBox!.y)

    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '03-reordered.png'), { maxHeight: 500 })
    steps.push({
      screenshotPath: 'screenshots/03-reordered.png',
      caption: 'Dropping above backend-api moves docs-site up',
      description:
        'The drop reorders the persisted sessions array; docs-site now renders above backend-api. ' +
        'This is a plain array move — no alphabetical re-sort is applied.',
    })
  })

  test('Step 3: Dragging over a different repo group shows no indicator, and the drop is rejected', async () => {
    // broomy is the lone session in the "demo-project" repo group — a different
    // group from the "No repo" sessions dragged above.
    const broomyCard = page.locator('[data-session-id="1"]')
    await expect(broomyCard).toBeVisible()

    const beforeOrder = await page.locator('[data-session-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-session-id')))

    // Unlike Step 2, this must NOT show the drop-indicator line while hovering — the
    // drop it would promise can never land, so the affordance stays off. This is the
    // regression case: a cross-group dragover used to render the line even though the
    // drop below was always a no-op. data-session-id="3" (docs-site) is the decoy —
    // still in the "No repo" group as the dragged backend-api card, used only to detect
    // that the drag has started before checking the real (cross-group) target.
    await dragElementExpectRejected(page, '[data-session-id="2"]', '[data-session-id="3"]', '[data-session-id="1"]')

    const afterOrder = await page.locator('[data-session-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-session-id')))
    expect(afterOrder).toEqual(beforeOrder)

    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '04-cross-group-rejected.png'), { maxHeight: 500 })
    steps.push({
      screenshotPath: 'screenshots/04-cross-group-rejected.png',
      caption: 'Dragging backend-api over the demo-project group shows no drop line',
      description:
        'Sessions can only be reordered within their own repo group. Hovering over a session in a ' +
        'different group shows no drop indicator, and dropping there is a no-op — the order shown ' +
        'in Step 2 is unchanged.',
    })
  })

  test('Step 4: Dragging a repo group header reorders the groups', async () => {
    const demoHeader = page.locator('[aria-expanded][aria-label*="demo-project"]')
    const noRepoHeader = page.locator('[aria-expanded][aria-label*="No repo"]')
    await expect(demoHeader).toBeVisible()
    await expect(noRepoHeader).toBeVisible()

    const demoBoxBefore = await demoHeader.boundingBox()
    const noRepoBoxBefore = await noRepoHeader.boundingBox()
    expect(demoBoxBefore!.y).toBeLessThan(noRepoBoxBefore!.y)

    // Drag "No repo" above "demo-project".
    await dragElement(
      page,
      '[aria-expanded][aria-label*="No repo"]',
      '[aria-expanded][aria-label*="demo-project"]',
      { towardTop: true },
    )

    const demoBoxAfter = await demoHeader.boundingBox()
    const noRepoBoxAfter = await noRepoHeader.boundingBox()
    expect(noRepoBoxAfter!.y).toBeLessThan(demoBoxAfter!.y)

    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '05-group-reordered.png'), { maxHeight: 500 })
    steps.push({
      screenshotPath: 'screenshots/05-group-reordered.png',
      caption: 'Dragging "No repo" above "demo-project" reorders the groups',
      description:
        'Repo group headers are draggable too, independent of session cards. The new group order ' +
        'is persisted per profile as repoGroupOrder.',
    })
  })

  test('Step 5: Archived sessions are never draggable', async () => {
    // Nothing starts archived in the mock data — archive docs-site first, the
    // same flow tests/sessions.spec.ts exercises.
    const docsSession = page.locator('[data-session-id="3"]')
    await docsSession.hover()
    await docsSession.locator('button[title="Archive session"]').click()

    const archivedToggle = page.locator('button:has-text("Archived")')
    await expect(archivedToggle).toBeVisible()
    await archivedToggle.click()

    const archivedCards = page.locator('[data-session-id][draggable="false"]')
    await expect(archivedCards.first()).toBeVisible()

    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '06-archived-not-draggable.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/06-archived-not-draggable.png',
      caption: 'Archived sessions can’t be dragged',
      description:
        'The archived section always sorts most-recently-archived first and never accepts drags — ' +
        'archived cards render with draggable="false" regardless of the sidebar’s drag state.',
    })
  })

  test('Step 6: Dragging is disabled while searching', async () => {
    const archivedToggle = page.locator('button:has-text("Archived")')
    await archivedToggle.click()

    const search = page.locator('[data-session-search]')
    await search.fill('api')
    await expect(page.locator('[data-session-id="2"]')).toBeVisible()

    const draggableSessions = page.locator('[data-session-id][draggable="true"]')
    await expect(draggableSessions).toHaveCount(0)

    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '07-search-disables-drag.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/07-search-disables-drag.png',
      caption: 'Searching turns off dragging',
      description:
        'The search view is a filtered projection of the full list, so a drop between two visible ' +
        'cards has no unambiguous position in the underlying array — every card renders ' +
        'draggable="false" while a search query is active.',
    })
    await search.fill('')
  })
})
