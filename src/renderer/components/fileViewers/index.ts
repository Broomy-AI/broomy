/**
 * File viewer plugin registry and content-type detection utilities.
 *
 * Maintains an ordered list of viewer plugins (Image, Markdown, Monaco) and provides
 * lookup functions that match a file path against each plugin's canHandle predicate,
 * returning viewers sorted by priority. Also exports an isTextContent heuristic that
 * checks for null bytes and printable-character ratio to distinguish text from binary.
 */
import type { FileViewerPlugin } from './types'
import { MonacoViewer } from './MonacoViewer'
import { ImageViewer } from './ImageViewer'
import { MarkdownViewer } from './MarkdownViewer'
import { WebviewViewer } from './WebviewViewer'

// Registry of all available file viewers
// Add new viewers here - they will automatically be available
const viewers: FileViewerPlugin[] = [
  WebviewViewer, // Highest priority for URLs
  ImageViewer,
  MarkdownViewer,
  MonacoViewer, // Fallback for text files
]

/**
 * Get all viewers that can handle the given file
 * Sorted by priority (highest first)
 */
export function getViewersForFile(filePath: string): FileViewerPlugin[] {
  return viewers
    .filter((viewer) => viewer.canHandle(filePath))
    .sort((a, b) => b.priority - a.priority)
}

/**
 * Get the default (highest priority) viewer for a file
 */
export function getDefaultViewer(filePath: string): FileViewerPlugin | null {
  const available = getViewersForFile(filePath)
  return available.length > 0 ? available[0] : null
}

/**
 * Check if a string appears to be text content (not binary)
 * Used by Monaco viewer to handle unknown file types
 */
export function isTextContent(content: string): boolean {
  // Empty content is valid text
  if (!content || content.length === 0) return true

  // Check for null bytes which indicate binary content
  if (content.includes('\0')) return false

  // Count non-text characters (C0 control chars excluding whitespace)
  let nonTextCount = 0
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i)
    // Only flag C0 control characters (0-31) that aren't common whitespace
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      nonTextCount++
    }
  }

  return nonTextCount / content.length < 0.1
}

export type { FileViewerPlugin, FileViewerComponentProps } from './types'
export { MonacoViewer } from './MonacoViewer'
export { ImageViewer } from './ImageViewer'
export { MarkdownViewer } from './MarkdownViewer'
export { WebviewViewer } from './WebviewViewer'
