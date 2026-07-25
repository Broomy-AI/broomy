/**
 * Per-session review comments store.
 *
 * Holds accumulated inline comments keyed by session directory and persists
 * them to `${dir}/.broomy/comments.json`. Shared by the Monaco viewers (which
 * create comments) and the explorer CommentsDock (which lists and submits
 * them). File-IO lives here so both surfaces stay in sync.
 */
import { create } from 'zustand'
import type { Comment } from './commentsFormat'

export type { Comment }

export function commentsFilePathFor(dir: string): string {
  return `${dir}/.broomy/comments.json`
}

function persist(dir: string, comments: Comment[]): void {
  window.fs.mkdir(`${dir}/.broomy`).catch(() => {})
  window.fs.writeFile(commentsFilePathFor(dir), JSON.stringify(comments, null, 2)).catch(() => {})
}

interface CommentsStore {
  // Values are undefined until a dir's comments have been loaded from disk,
  // which is how the dock distinguishes "not loaded yet" from "loaded, empty".
  commentsByDir: Record<string, Comment[] | undefined>
  loadComments: (sessionDir: string) => Promise<void>
  addComment: (sessionDir: string, input: { file: string; line: number; quotedText: string; body: string }) => Comment
  updateComment: (sessionDir: string, id: string, body: string) => void
  resolveComment: (sessionDir: string, id: string) => void
  clearComments: (sessionDir: string) => void
}

export const useCommentsStore = create<CommentsStore>((set, get) => ({
  commentsByDir: {},

  loadComments: async (sessionDir) => {
    let loaded: Comment[] = []
    try {
      if (await window.fs.exists(commentsFilePathFor(sessionDir))) {
        loaded = JSON.parse(await window.fs.readFile(commentsFilePathFor(sessionDir)))
      }
    } catch {
      loaded = []
    }
    set((s) => ({ commentsByDir: { ...s.commentsByDir, [sessionDir]: loaded } }))
  },

  addComment: (sessionDir, input) => {
    const comment: Comment = {
      id: `comment-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      createdAt: new Date().toISOString(),
      ...input,
      body: input.body.trim(),
    }
    const next = [...(get().commentsByDir[sessionDir] ?? []), comment]
    set((s) => ({ commentsByDir: { ...s.commentsByDir, [sessionDir]: next } }))
    persist(sessionDir, next)
    return comment
  },

  updateComment: (sessionDir, id, body) => {
    const next = (get().commentsByDir[sessionDir] ?? []).map((c) =>
      c.id === id ? { ...c, body: body.trim() } : c,
    )
    set((s) => ({ commentsByDir: { ...s.commentsByDir, [sessionDir]: next } }))
    persist(sessionDir, next)
  },

  resolveComment: (sessionDir, id) => {
    const next = (get().commentsByDir[sessionDir] ?? []).filter((c) => c.id !== id)
    set((s) => ({ commentsByDir: { ...s.commentsByDir, [sessionDir]: next } }))
    persist(sessionDir, next)
  },

  clearComments: (sessionDir) => {
    set((s) => ({ commentsByDir: { ...s.commentsByDir, [sessionDir]: [] } }))
    persist(sessionDir, [])
  },
}))
