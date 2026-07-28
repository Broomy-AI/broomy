import { describe, it, expect } from 'vitest'
import { sessionErrorMessage } from './sessionErrorMessage'

const session = (over: Partial<{ directory: string; initError: string | null }> = {}) => ({
  directory: '/repos/proj/feat',
  initError: null,
  ...over,
})

describe('sessionErrorMessage', () => {
  it('returns null when there is no active session', () => {
    expect(sessionErrorMessage(null, true)).toBeNull()
    expect(sessionErrorMessage(undefined, false)).toBeNull()
  })

  it('returns null for a healthy session', () => {
    expect(sessionErrorMessage(session(), true)).toBeNull()
  })

  it('reports a missing folder when there is no recorded failure', () => {
    expect(sessionErrorMessage(session(), false)).toBe('Folder not found: /repos/proj/feat')
  })

  it('prefers the init failure over the missing folder it caused', () => {
    // A branch clash fails before the worktree exists, so both conditions hold at once — showing
    // "Folder not found" would report the symptom and hide the cause.
    const initError = 'A local branch "feat" already exists. Open that session instead, or pick a different name.'
    expect(sessionErrorMessage(session({ initError }), false)).toBe(initError)
  })

  it('reports an init failure even when the folder does exist', () => {
    // WORKTREE_PATH_EXISTS is the inverse case: the folder is present, and that is the complaint.
    const initError = 'A folder already exists at "/repos/proj/feat". Remove or rename it, then try again.'
    expect(sessionErrorMessage(session({ initError }), true)).toBe(initError)
  })
})
