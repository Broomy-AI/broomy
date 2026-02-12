/**
 * Heuristic detection of text vs binary file content.
 *
 * Checks for null bytes (a strong binary indicator) and then computes the ratio
 * of printable characters to total characters. Content is considered text if at
 * least 85% of characters are printable (ASCII 32-126, common whitespace, or
 * extended Latin). Empty content is treated as text.
 */
export function isTextContent(content: string): boolean {
  if (!content || content.length === 0) return true
  // Check for null bytes which indicate binary content
  if (content.includes('\0')) return false
  // Check if most characters are printable
  const printableRatio = content.split('').filter((char) => {
    const code = char.charCodeAt(0)
    return (code >= 32 && code <= 126) || code === 9 || code === 10 || code === 13 || (code >= 160 && code <= 255)
  }).length / content.length
  return printableRatio > 0.85
}
