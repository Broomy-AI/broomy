/**
 * Normalizes git status responses between old and new IPC formats.
 *
 * The git status IPC handler evolved from returning a flat array of file statuses
 * to returning an object with files, ahead/behind counts, tracking branch, and
 * current branch. This normalizer accepts either format and always returns the
 * new object format with safe defaults for missing fields, ensuring downstream
 * consumers do not need format-aware branching logic.
 */
import type { GitFileStatus, GitStatusResult } from '../../preload/index'

/**
 * Normalize git status response - handles both old array format and new object format.
 */
export function normalizeGitStatus(status: unknown): GitStatusResult {
  // New format: object with files array
  if (status && typeof status === 'object' && !Array.isArray(status) && 'files' in status) {
    const s = status as GitStatusResult
    return {
      files: (s.files || []).map(f => ({
        ...f,
        staged: f.staged ?? false,
        indexStatus: f.indexStatus ?? ' ',
        workingDirStatus: f.workingDirStatus ?? ' ',
      })),
      ahead: s.ahead ?? 0,
      behind: s.behind ?? 0,
      tracking: s.tracking ?? null,
      current: s.current ?? null,
    }
  }
  // Old format: flat array of {path, status}
  if (Array.isArray(status)) {
    return {
      files: status.map((f: GitFileStatus) => ({
        path: f.path,
        status: f.status,
        staged: f.staged ?? false,
        indexStatus: f.indexStatus ?? ' ',
        workingDirStatus: f.workingDirStatus ?? ' ',
      })),
      ahead: 0,
      behind: 0,
      tracking: null,
      current: null,
    }
  }
  return { files: [], ahead: 0, behind: 0, tracking: null, current: null }
}
