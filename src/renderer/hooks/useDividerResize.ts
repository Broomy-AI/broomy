import { useEffect, useState, useCallback, useRef } from 'react'
import type { LayoutSizes, FileViewerPosition } from '../store/sessions'

type DividerType = 'sidebar' | 'explorer' | 'review' | 'fileViewer' | 'userTerminal' | null

interface UseDividerResizeParams {
  fileViewerPosition: FileViewerPosition
  sidebarWidth: number
  showSidebar: boolean
  showExplorer: boolean
  layoutSizes: LayoutSizes
  onSidebarWidthChange: (width: number) => void
  onLayoutSizeChange: (key: keyof LayoutSizes, value: number) => void
}

export function useDividerResize({
  fileViewerPosition,
  sidebarWidth,
  showSidebar,
  showExplorer,
  layoutSizes,
  onSidebarWidthChange,
  onLayoutSizeChange,
}: UseDividerResizeParams) {
  const [draggingDivider, setDraggingDivider] = useState<DividerType>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const mainContentRef = useRef<HTMLDivElement>(null)

  // Handle drag for resizing panels
  const handleMouseDown = useCallback((divider: DividerType) => (e: React.MouseEvent) => {
    e.preventDefault()
    setDraggingDivider(divider)
  }, [])

  useEffect(() => {
    if (!draggingDivider) return

    const handleMouseMove = (e: MouseEvent) => {
      const mainRect = mainContentRef.current?.getBoundingClientRect()
      const centerRect = containerRef.current?.getBoundingClientRect()

      switch (draggingDivider) {
        case 'sidebar': {
          if (!mainRect) return
          const newWidth = e.clientX - mainRect.left
          onSidebarWidthChange(Math.max(150, Math.min(newWidth, 400)))
          break
        }
        case 'explorer': {
          if (!mainRect) return
          const offset = showSidebar ? sidebarWidth : 0
          const newWidth = e.clientX - mainRect.left - offset
          onLayoutSizeChange('explorerWidth', Math.max(150, Math.min(newWidth, 500)))
          break
        }
        case 'review': {
          if (!mainRect) return
          let reviewOffset = showSidebar ? sidebarWidth : 0
          if (showExplorer) reviewOffset += layoutSizes.explorerWidth
          const newReviewWidth = e.clientX - mainRect.left - reviewOffset
          onLayoutSizeChange('reviewPanelWidth', Math.max(250, Math.min(newReviewWidth, 600)))
          break
        }
        case 'fileViewer': {
          if (!centerRect) return
          if (fileViewerPosition === 'top') {
            const newHeight = e.clientY - centerRect.top
            const maxHeight = centerRect.height - 100
            onLayoutSizeChange('fileViewerSize', Math.max(100, Math.min(newHeight, maxHeight)))
          } else {
            const newWidth = e.clientX - centerRect.left
            const maxWidth = centerRect.width - 200
            onLayoutSizeChange('fileViewerSize', Math.max(200, Math.min(newWidth, maxWidth)))
          }
          break
        }
        case 'userTerminal': {
          if (!centerRect) return
          const newHeight = centerRect.bottom - e.clientY
          onLayoutSizeChange('userTerminalHeight', Math.max(100, Math.min(newHeight, 500)))
          break
        }
      }
    }

    const handleMouseUp = () => {
      setDraggingDivider(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [draggingDivider, fileViewerPosition, sidebarWidth, showSidebar, onSidebarWidthChange, onLayoutSizeChange])

  return {
    draggingDivider,
    containerRef,
    mainContentRef,
    handleMouseDown,
  }
}

export type { DividerType }
