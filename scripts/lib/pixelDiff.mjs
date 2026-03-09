import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'

/**
 * Compare two PNG images and return diff statistics.
 * @param {string} currentPath - Path to current screenshot
 * @param {string} referencePath - Path to reference screenshot
 * @param {string} diffPath - Path to write diff image
 * @param {string} storyId - Story identifier
 * @returns {{ storyId: string, diffPixels: number, totalPixels: number, diffPercent: number, status: 'pass'|'fail'|'new' }}
 */
export function pixelDiff(currentPath, referencePath, diffPath, storyId) {
  let refData
  try {
    refData = readFileSync(referencePath)
  } catch {
    return { storyId, diffPixels: 0, totalPixels: 0, diffPercent: 0, status: 'new' }
  }

  const current = PNG.sync.read(readFileSync(currentPath))
  const reference = PNG.sync.read(refData)

  // Use larger dimensions if sizes differ
  const width = Math.max(current.width, reference.width)
  const height = Math.max(current.height, reference.height)
  const diff = new PNG({ width, height })

  // If sizes differ, create padded versions
  const padImage = (img, w, h) => {
    if (img.width === w && img.height === h) return img.data
    const padded = new PNG({ width: w, height: h })
    PNG.bitblt(img, padded, 0, 0, img.width, img.height, 0, 0)
    return padded.data
  }

  const currentData = padImage(current, width, height)
  const referenceData = padImage(reference, width, height)

  const diffPixels = pixelmatch(
    currentData,
    referenceData,
    diff.data,
    width,
    height,
    { threshold: 0.1 }
  )

  const totalPixels = width * height
  const diffPercent = totalPixels > 0 ? (diffPixels / totalPixels) * 100 : 0

  mkdirSync(dirname(diffPath), { recursive: true })
  writeFileSync(diffPath, PNG.sync.write(diff))

  const threshold = 0.1 // percent
  return {
    storyId,
    diffPixels,
    totalPixels,
    diffPercent,
    status: diffPercent > threshold ? 'fail' : 'pass',
  }
}
