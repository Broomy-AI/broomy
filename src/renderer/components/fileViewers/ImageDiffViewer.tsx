/**
 * Side-by-side image comparison viewer for diff mode.
 *
 * Loads the original image from git (via showBase64) and the current image from disk
 * (via readFileBase64), then displays them side by side with "Before" / "After" labels.
 * Handles added files (no before), deleted files (no after), and modified files (both).
 */
import { useState, useEffect } from 'react'
import type { FileStatus } from '../FileViewer'

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg']

const getMimeType = (filePath: string): string => {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
    svg: 'image/svg+xml',
  }
  return mimeMap[ext] || 'image/png'
}

export function isImageFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  return IMAGE_EXTENSIONS.includes(ext)
}

interface ImageDiffViewerProps {
  filePath: string
  directory?: string
  fileStatus?: FileStatus
  diffBaseRef?: string
  diffCurrentRef?: string
}

export default function ImageDiffViewer({
  filePath,
  directory,
  fileStatus,
  diffBaseRef,
  diffCurrentRef,
}: ImageDiffViewerProps) {
  const [originalDataUrl, setOriginalDataUrl] = useState<string | null>(null)
  const [modifiedDataUrl, setModifiedDataUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    setOriginalDataUrl(null)
    setModifiedDataUrl(null)

    const load = async () => {
      const mimeType = getMimeType(filePath)
      const relativePath = directory && filePath.startsWith(`${directory}/`)
        ? filePath.slice(directory.length + 1)
        : filePath

      try {
        // Load original (before) from git
        if (fileStatus !== 'added' && fileStatus !== 'untracked' && directory) {
          const ref = diffBaseRef || 'HEAD'
          const base64 = await window.git.showBase64(directory, relativePath, ref)
          if (!cancelled && base64) {
            setOriginalDataUrl(`data:${mimeType};base64,${base64}`)
          }
        }

        // Load modified (after) — from git ref or from disk
        if (fileStatus !== 'deleted') {
          if (diffCurrentRef && directory) {
            const base64 = await window.git.showBase64(directory, relativePath, diffCurrentRef)
            if (!cancelled && base64) {
              setModifiedDataUrl(`data:${mimeType};base64,${base64}`)
            }
          } else {
            const base64 = await window.fs.readFileBase64(filePath)
            if (!cancelled && base64) {
              setModifiedDataUrl(`data:${mimeType};base64,${base64}`)
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load images')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void load()
    return () => { cancelled = true }
  }, [filePath, directory, fileStatus, diffBaseRef, diffCurrentRef])

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary text-sm">
        Loading images...
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-red-400 text-sm">
        {error}
      </div>
    )
  }

  const isAdded = fileStatus === 'added' || fileStatus === 'untracked'
  const isDeleted = fileStatus === 'deleted'

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 flex">
        {/* Before */}
        {!isAdded && (
          <div className="flex-1 flex flex-col border-r border-border min-w-0">
            <div className="flex-shrink-0 px-3 py-1.5 text-xs text-text-secondary bg-bg-secondary border-b border-border text-center">
              Before
            </div>
            <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
              {originalDataUrl ? (
                <img
                  src={originalDataUrl}
                  alt="Before"
                  className="object-contain max-w-full max-h-full"
                  draggable={false}
                />
              ) : (
                <span className="text-xs text-text-secondary">Not in repository</span>
              )}
            </div>
          </div>
        )}
        {/* After */}
        {!isDeleted && (
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-shrink-0 px-3 py-1.5 text-xs text-text-secondary bg-bg-secondary border-b border-border text-center">
              After
            </div>
            <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
              {modifiedDataUrl ? (
                <img
                  src={modifiedDataUrl}
                  alt="After"
                  className="object-contain max-w-full max-h-full"
                  draggable={false}
                />
              ) : (
                <span className="text-xs text-text-secondary">File deleted</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
