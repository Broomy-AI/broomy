/**
 * Extract and format file paths from a terminal drop event.
 *
 * Two drag sources: OS files (Finder etc., via File.path) and Broomy's own file
 * explorer (via FILE_PATH_MIME). Paths are quoted per the terminal's actual
 * shell so they land at the prompt as inert literal arguments, never executed.
 * Paths containing control characters are dropped — a literal newline/ESC
 * written to the PTY would submit the line or inject an escape sequence.
 */
import { FILE_PATH_MIME } from '../../../../shared/dnd'
import { quoteForShell, type ShellKind } from '../../../../shared/shellQuote'

/** C0 controls + DEL — a newline/ESC/NUL in a path would be unsafe at the PTY. */
const CONTROL_CHARS = /[\x00-\x1F\x7F]/

/**
 * Pull file paths out of a DataTransfer. OS file drops win (there may be
 * several); otherwise a single path from FILE_PATH_MIME. The MIME value is NOT
 * newline-split — a POSIX filename may legitimately contain `\n`, and the
 * explorer sets exactly one path. Any path with control characters is dropped.
 */
export function extractDroppedPaths(dt: DataTransfer): string[] {
  const paths: string[] = []
  if (dt.files.length > 0) {
    for (const file of Array.from(dt.files)) {
      // Electron augments the global File with an absolute `path` (Electron 28).
      if (file.path) paths.push(file.path)
    }
  } else {
    const mimePath = dt.getData(FILE_PATH_MIME)
    if (mimePath) paths.push(mimePath)
  }
  return paths.filter((p) => {
    if (CONTROL_CHARS.test(p)) {
      console.warn('[droppedFilePaths] dropping path with control characters')
      return false
    }
    return true
  })
}

/**
 * Quote each path for `kind`, drop any that cannot be safely encoded (cmd paths
 * containing % or !), join with spaces, and append a trailing space (iTerm2
 * parity). Returns '' when nothing survives — e.g. every cmd path was rejected.
 */
export function formatPathsForShell(paths: string[], kind: ShellKind): string {
  const quoted = paths
    .map((p) => quoteForShell(p, kind))
    .filter((q): q is string => q !== null)
  if (quoted.length === 0) return ''
  return `${quoted.join(' ')} `
}
