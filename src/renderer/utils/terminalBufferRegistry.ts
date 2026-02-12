/**
 * Global registry for accessing terminal buffer content from outside Terminal components.
 *
 * Terminal components register a getter function keyed by session ID on mount and
 * unregister on unmount. Other parts of the app (e.g. keyboard shortcut handlers)
 * can retrieve the full buffer or the last N lines for a given session without
 * needing a direct reference to the xterm.js Terminal instance.
 */

type BufferGetter = () => string

const bufferGetters = new Map<string, BufferGetter>()

export const terminalBufferRegistry = {
  register(sessionId: string, getter: BufferGetter) {
    bufferGetters.set(sessionId, getter)
  },

  unregister(sessionId: string) {
    bufferGetters.delete(sessionId)
  },

  getBuffer(sessionId: string): string | null {
    const getter = bufferGetters.get(sessionId)
    return getter ? getter() : null
  },

  // Get last N lines from buffer
  getLastLines(sessionId: string, lineCount: number): string | null {
    const buffer = this.getBuffer(sessionId)
    if (!buffer) return null

    const lines = buffer.split('\n')
    const lastLines = lines.slice(-lineCount)
    return lastLines.join('\n')
  }
}
