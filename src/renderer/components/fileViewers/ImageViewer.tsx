/**
 * Image file viewer with zoom and pan controls.
 *
 * Loads image files as base64 data URLs via IPC, renders them centered in a container,
 * and provides zoom in/out/reset buttons plus Ctrl+scroll wheel zooming. When zoomed
 * beyond 100%, drag-to-pan is enabled. Supports PNG, JPEG, GIF, WebP, BMP, ICO, and
 * SVG formats with correct MIME type mapping.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import type { FileViewerPlugin, FileViewerComponentProps } from './types'
import { matchesExtensions, getFileExtension } from './types'

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg']

// Map extensions to MIME types
const getMimeType = (filePath: string): string => {
  const ext = getFileExtension(filePath)
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

function ImageViewerComponent({ filePath }: FileViewerComponentProps) {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [error, setError] = useState<string | null>(null)
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false

    const loadImage = async () => {
      setIsLoading(true)
      setError(null)
      setScale(1)
      setPosition({ x: 0, y: 0 })

      try {
        const base64 = await window.fs.readFileBase64(filePath)
        if (!cancelled) {
          const mimeType = getMimeType(filePath)
          setImageDataUrl(`data:${mimeType};base64,${base64}`)
          setIsLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load image')
          setIsLoading(false)
        }
      }
    }

    void loadImage()

    return () => {
      cancelled = true
    }
  }, [filePath])

  const handleZoomIn = () => setScale((s) => Math.min(s * 1.25, 10))
  const handleZoomOut = () => setScale((s) => Math.max(s / 1.25, 0.1))
  const handleReset = () => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale <= 1) return // Only allow panning when zoomed in
    e.preventDefault()
    setIsDragging(true)
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
  }, [scale, position])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    })
  }, [isDragging, dragStart])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Handle wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      setScale((s) => Math.max(0.1, Math.min(10, s * delta)))
    }
  }, [])

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary text-sm">
        Loading image...
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

  const canPan = scale > 1

  return (
    <div className="h-full flex flex-col">
      {/* Zoom controls */}
      <div className="flex-shrink-0 p-2 border-b border-border flex items-center gap-2">
        <button
          onClick={handleZoomOut}
          className="px-2 py-1 text-xs rounded bg-bg-tertiary text-text-secondary hover:text-text-primary"
          title="Zoom out"
        >
          -
        </button>
        <span className="text-xs text-text-secondary min-w-[60px] text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={handleZoomIn}
          className="px-2 py-1 text-xs rounded bg-bg-tertiary text-text-secondary hover:text-text-primary"
          title="Zoom in"
        >
          +
        </button>
        <button
          onClick={handleReset}
          className="px-2 py-1 text-xs rounded bg-bg-tertiary text-text-secondary hover:text-text-primary"
          title="Reset zoom and position"
        >
          Reset
        </button>
        {canPan && (
          <span className="text-xs text-text-secondary ml-2">
            Drag to pan
          </span>
        )}
      </div>

      {/* Image display */}
      <div
        ref={containerRef}
        className={`flex-1 overflow-hidden flex items-center justify-center bg-bg-primary p-4 ${
          canPan ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : ''
        }`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
      >
        {imageDataUrl && (
          <img
            src={imageDataUrl}
            alt={filePath}
            draggable={false}
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transformOrigin: 'center center',
              maxWidth: scale === 1 ? '100%' : 'none',
              maxHeight: scale === 1 ? '100%' : 'none',
              userSelect: 'none',
            }}
            className="object-contain"
          />
        )}
      </div>
    </div>
  )
}

export const ImageViewer: FileViewerPlugin = {
  id: 'image',
  name: 'Image',
  icon: (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  ),
  canHandle: (filePath: string) => matchesExtensions(filePath, IMAGE_EXTENSIONS),
  priority: 100, // High priority for images
  component: ImageViewerComponent,
}
