import type { Page, Locator } from '@playwright/test'

interface ScreenshotOpts {
  /** Padding around the element in pixels (default: 4) */
  padding?: number
  /** Maximum height to capture from the top (default: unlimited) */
  maxHeight?: number
}

/**
 * Screenshot a single element, optionally cropped to a max height.
 */
export async function screenshotElement(
  page: Page,
  locator: Locator,
  filePath: string,
  opts: ScreenshotOpts = {},
): Promise<void> {
  const { padding = 4, maxHeight } = opts
  const box = await locator.boundingBox()
  if (!box) throw new Error(`Element not found for screenshot: ${filePath}`)

  const height = maxHeight ? Math.min(box.height + padding * 2, maxHeight) : box.height + padding * 2

  await page.screenshot({
    path: filePath,
    type: 'png',
    clip: {
      x: Math.max(0, box.x - padding),
      y: Math.max(0, box.y - padding),
      width: box.width + padding * 2,
      height,
    },
  })
}

/**
 * Screenshot a region spanning from the top of one element to the bottom of another.
 */
export async function screenshotRegion(
  page: Page,
  topLocator: Locator,
  bottomLocator: Locator,
  filePath: string,
  opts: ScreenshotOpts = {},
): Promise<void> {
  const { padding = 4, maxHeight } = opts
  const topBox = await topLocator.boundingBox()
  const bottomBox = await bottomLocator.boundingBox()
  if (!topBox || !bottomBox) throw new Error(`Elements not found for region screenshot: ${filePath}`)

  const x = Math.max(0, Math.min(topBox.x, bottomBox.x) - padding)
  const y = Math.max(0, topBox.y - padding)
  const right = Math.max(topBox.x + topBox.width, bottomBox.x + bottomBox.width) + padding
  const bottom = bottomBox.y + bottomBox.height + padding
  const width = right - x
  let height = bottom - y

  if (maxHeight) height = Math.min(height, maxHeight)

  await page.screenshot({
    path: filePath,
    type: 'png',
    clip: { x, y, width, height },
  })
}

/**
 * Screenshot an explicit clip region of the page.
 */
export async function screenshotClip(
  page: Page,
  clip: { x: number; y: number; width: number; height: number },
  filePath: string,
): Promise<void> {
  await page.screenshot({
    path: filePath,
    type: 'png',
    clip,
  })
}
