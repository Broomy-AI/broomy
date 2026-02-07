// Comprehensive ANSI/terminal escape sequence stripping
// Shared utility extracted for reuse across components

const ANSI_REGEX = new RegExp([
  // CSI sequences (most common): ESC [ ... letter
  '\\x1b\\[[0-9;?>=!]*[A-Za-z~]',
  // OSC sequences: ESC ] ... (BEL or ST)
  '\\x1b\\][^\\x07\\x1b]*(?:\\x07|\\x1b\\\\)?',
  // DCS/PM/APC/SOS sequences: ESC P/^/_  ... ST
  '\\x1b[PX^_][^\\x1b]*(?:\\x1b\\\\)?',
  // SS2/SS3 sequences
  '\\x1b[NO][^\\x1b]?',
  // Other ESC sequences
  '\\x1b[\\[\\]()#][0-9;?]*[A-Za-z]?',
  '\\x1b[A-Za-z]',
  // Standalone control characters
  '\\x07|\\x1b',
  // Leftover CSI fragments (numbers followed by letters that look like escape remnants)
  '\\[\\?[0-9]+[a-z]',
].join('|'), 'g')

// Additional cleanup for common escape sequence remnants
const ESCAPE_REMNANTS = /\[\??\d+[hlmnsu]|\d+[A-Za-z](?=[^a-zA-Z]|$)/g

export function stripAnsi(text: string): string {
  let result = text.replace(ANSI_REGEX, '')
  result = result.replace(ESCAPE_REMNANTS, '')
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
  return result
}
