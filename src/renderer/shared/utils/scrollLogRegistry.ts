/**
 * Global registry for terminal scroll logs, used for debug dumps.
 *
 * Lives in shared/utils because it's consumed by both the agent panel
 * (which writes logs) and features/sessions (which reads them for
 * the Cmd+Shift+C debug copy).
 */
import type { ScrollLog } from '../../panels/agent/utils/scrollLog'

const logs = new Map<string, ScrollLog>()

export const scrollLogRegistry = {
  register(sessionId: string, log: ScrollLog) {
    logs.set(sessionId, log)
  },
  unregister(sessionId: string) {
    logs.delete(sessionId)
  },
  get(sessionId: string): ScrollLog | undefined {
    return logs.get(sessionId)
  },
  format(sessionId: string): string {
    return logs.get(sessionId)?.format() ?? '(no scroll log)'
  },
}
