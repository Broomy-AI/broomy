/**
 * Heuristic detection of text vs binary file content.
 *
 * Checks for null bytes (a strong binary indicator) and then counts C0 control
 * characters (excluding common whitespace). Content is considered text if fewer
 * than 10% of characters are control characters. This correctly handles UTF-8
 * files with Unicode characters (emoji, CJK, etc.). Empty content is treated as text.
 */
export function isTextContent(content: string): boolean {
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
