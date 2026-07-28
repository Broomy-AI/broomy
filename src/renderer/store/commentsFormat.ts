/**
 * Pure helpers for turning accumulated review comments into the numbered
 * feedback block sent to the agent, and for display path shortening.
 */

export interface Comment {
  id: string
  file: string
  line: number
  quotedText: string
  body: string
  createdAt: string
}

/** Make `file` relative to `sessionDir` when it lives under it; otherwise return it unchanged. */
export function toRelativePath(file: string, sessionDir: string): string {
  const prefix = sessionDir.endsWith('/') ? sessionDir : `${sessionDir}/`
  return file.startsWith(prefix) ? file.slice(prefix.length) : file
}

/**
 * Build the outbound feedback message:
 *
 *   Some feedback. Let me know what you think.
 *   1.) path:line: "quoted"
 *   body
 *
 *   2.) ...
 */
export function formatCommentsForAgent(comments: Comment[], sessionDir: string): string {
  const blocks = comments.map((c, i) => {
    const path = toRelativePath(c.file, sessionDir)
    return `${i + 1}.) ${path}:${c.line}: "${c.quotedText.trim()}"\n${c.body.trim()}\n`
  })
  return `Some feedback. Let me know what you think.\n${blocks.join('\n')}`
}
