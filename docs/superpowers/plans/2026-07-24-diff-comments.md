# Inline file/diff comments → submit to agent (v1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user add discoverable line-level comments on any file/diff, see them accumulate in a collapsible/resizable panel docked at the bottom of the explorer, and submit them all to the agent as one numbered feedback block.

**Architecture:** A new Zustand store (`store/comments.ts`) keyed by session directory becomes the single source of truth for comments, persisted to `.broomy/comments.json`. The Monaco viewers gain a discoverable hover "+" affordance and an under-the-line comment box (Monaco view zone + React portal) that writes into the store. A new `CommentsDock` component reads the store, lists comments, and submits them via `sendAgentPrompt`. Commenting is ungated from review-only to all sessions.

**Tech Stack:** Electron + React + TypeScript, Zustand, `@monaco-editor/react` / `monaco-editor`, Tailwind, Vitest, Storybook, Playwright.

## Global Constraints

- Package manager is **pnpm** only (never npm/yarn). Run `pnpm install` before tests.
- **Never use `${}` / `$(...)` shell expansion** in Bash tool calls.
- Unit tests co-located as `*.test.ts(x)`; Vitest with **90% line coverage** threshold.
- `window.fs`, `window.pty`, etc. are globally mocked in `src/test/setup.ts` — use `vi.mocked(window.fs.writeFile)` to assert.
- **Do not run tests/checks manually — use `/validate`** (runs lint, typecheck, check:all, unit, coverage, E2E and fixes failures). It is the final verification task.
- Comments persist per-session to `${sessionDir}/.broomy/comments.json` via `window.fs` (`exists`/`readFile`/`mkdir`/`writeFile`). This does NOT go through `configPersistence.ts`.
- Follow existing file conventions: top-of-file JSDoc block comment describing the module; Tailwind semantic tokens (`text-text-secondary`, `bg-bg-secondary`, `border-border`, `bg-accent`, etc.) — no raw hex.
- Submit format has **no** "reply in numbered bullets" trailer in v1.

---

## File Structure

- **Create** `src/renderer/store/comments.ts` — Zustand store: `Comment` type, `commentsByDir` state, load/add/update/resolve/clear actions, per-dir persistence. Owns all comment file-IO.
- **Create** `src/renderer/store/comments.test.ts` — store unit tests.
- **Create** `src/renderer/store/commentsFormat.ts` — pure formatters: `toRelativePath`, `formatCommentsForAgent`.
- **Create** `src/renderer/store/commentsFormat.test.ts` — formatter unit tests.
- **Create** `src/renderer/panels/fileViewer/hooks/useCommentBox.ts` — manages the under-the-line Monaco view zone + portal target.
- **Create** `src/renderer/panels/fileViewer/components/InlineCommentBox.tsx` — the React comment input rendered into the view zone.
- **Create** `src/renderer/panels/explorer/CommentsDock.tsx` — docked list + submit.
- **Create** `src/renderer/panels/explorer/CommentsDock.stories.tsx` — Storybook stories.
- **Create** `src/renderer/panels/explorer/CommentsDock.test.tsx` — render/behavior test.
- **Modify** `src/renderer/panels/fileViewer/hooks/useMonacoComments.ts` — route through the store; add `quotedText` capture; rename `reviewContext`→`commentsContext`; add hover "+" decoration.
- **Modify** `src/renderer/panels/fileViewer/viewers/MonacoViewer.tsx` and `MonacoDiffViewer.tsx` — rename prop; discoverable hover "+"; render `InlineCommentBox` via the view zone instead of the top bar.
- **Modify** `src/renderer/panels/fileViewer/FileViewer.tsx` and `viewers/types.ts` — rename `reviewContext`→`commentsContext`.
- **Modify** `src/renderer/hooks/usePanelsMap.tsx` — ungate: pass `commentsContext` for **all** sessions.
- **Modify** `src/renderer/panels/explorer/ExplorerPanel.tsx` — render `<CommentsDock>` pinned at the bottom across all tabs.
- **Create** `tests/e2e/diff-comments.spec.ts` — E2E for the dock.

---

## Task 1: Comment formatter (pure functions)

**Files:**
- Create: `src/renderer/store/commentsFormat.ts`
- Test: `src/renderer/store/commentsFormat.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface Comment { id: string; file: string; line: number; quotedText: string; body: string; createdAt: string }` (canonical; re-exported by the store in Task 2 — define it here and import from here).
  - `toRelativePath(file: string, sessionDir: string): string`
  - `formatCommentsForAgent(comments: Comment[], sessionDir: string): string`

- [ ] **Step 1: Write the failing tests**

Create `src/renderer/store/commentsFormat.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toRelativePath, formatCommentsForAgent, type Comment } from './commentsFormat'

const mk = (over: Partial<Comment>): Comment => ({
  id: 'c1', file: '/repo/src/a.ts', line: 42,
  quotedText: 'const x = 1', body: 'why 1?', createdAt: '2026-07-24T00:00:00.000Z',
  ...over,
})

describe('toRelativePath', () => {
  it('strips the session directory prefix', () => {
    expect(toRelativePath('/repo/src/a.ts', '/repo')).toBe('src/a.ts')
  })
  it('leaves already-relative or unrelated paths unchanged', () => {
    expect(toRelativePath('src/a.ts', '/repo')).toBe('src/a.ts')
    expect(toRelativePath('/other/b.ts', '/repo')).toBe('/other/b.ts')
  })
})

describe('formatCommentsForAgent', () => {
  it('formats a single comment with header and numbering', () => {
    const out = formatCommentsForAgent([mk({})], '/repo')
    expect(out).toBe(
      'Some feedback. Let me know what you think.\n' +
      '1.) src/a.ts:42: "const x = 1"\n' +
      'why 1?\n'
    )
  })
  it('numbers multiple comments with a blank line between them', () => {
    const out = formatCommentsForAgent(
      [mk({ id: 'c1' }), mk({ id: 'c2', file: '/repo/src/b.ts', line: 7, quotedText: 'return', body: 'add a test' })],
      '/repo',
    )
    expect(out).toBe(
      'Some feedback. Let me know what you think.\n' +
      '1.) src/a.ts:42: "const x = 1"\n' +
      'why 1?\n' +
      '\n' +
      '2.) src/b.ts:7: "return"\n' +
      'add a test\n'
    )
  })
  it('trims quotedText whitespace for the quote', () => {
    const out = formatCommentsForAgent([mk({ quotedText: '   const x = 1   ' })], '/repo')
    expect(out).toContain('"const x = 1"')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/renderer/store/commentsFormat.test.ts`
Expected: FAIL — cannot find module `./commentsFormat`.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/store/commentsFormat.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/renderer/store/commentsFormat.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/store/commentsFormat.ts src/renderer/store/commentsFormat.test.ts
git commit -m "feat(comments): pure formatter for outbound feedback block"
```

---

## Task 2: Comments store

**Files:**
- Create: `src/renderer/store/comments.ts`
- Test: `src/renderer/store/comments.test.ts`

**Interfaces:**
- Consumes: `Comment` from `./commentsFormat`.
- Produces:
  - `commentsFilePathFor(dir: string): string` → `${dir}/.broomy/comments.json`
  - `useCommentsStore` with state `commentsByDir: Record<string, Comment[]>` and actions:
    - `loadComments(sessionDir: string): Promise<void>`
    - `addComment(sessionDir: string, input: { file: string; line: number; quotedText: string; body: string }): Comment`
    - `updateComment(sessionDir: string, id: string, body: string): void`
    - `resolveComment(sessionDir: string, id: string): void`
    - `clearComments(sessionDir: string): void`
  - Re-export `type Comment`.

- [ ] **Step 1: Write the failing tests**

Create `src/renderer/store/comments.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useCommentsStore, commentsFilePathFor } from './comments'

const DIR = '/repo'
const FILE = '/repo/src/a.ts'

describe('useCommentsStore', () => {
  beforeEach(() => {
    useCommentsStore.setState({ commentsByDir: {} })
    vi.clearAllMocks()
    vi.mocked(window.fs.exists).mockResolvedValue(false)
    vi.mocked(window.fs.readFile).mockResolvedValue('[]')
    vi.mocked(window.fs.writeFile).mockResolvedValue({ success: true })
    vi.mocked(window.fs.mkdir).mockResolvedValue({ success: true })
  })

  it('commentsFilePathFor builds the .broomy path', () => {
    expect(commentsFilePathFor('/repo')).toBe('/repo/.broomy/comments.json')
  })

  it('loadComments reads and stores comments for a dir', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify([
      { id: 'c1', file: FILE, line: 1, quotedText: 'x', body: 'b', createdAt: 't' },
    ]))
    await useCommentsStore.getState().loadComments(DIR)
    expect(useCommentsStore.getState().commentsByDir[DIR]).toHaveLength(1)
  })

  it('loadComments tolerates a missing file (empty list)', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false)
    await useCommentsStore.getState().loadComments(DIR)
    expect(useCommentsStore.getState().commentsByDir[DIR]).toEqual([])
  })

  it('addComment appends and persists to the .broomy path', () => {
    const c = useCommentsStore.getState().addComment(DIR, { file: FILE, line: 5, quotedText: 'q', body: 'hi' })
    expect(c.id).toBeTruthy()
    expect(c.createdAt).toBeTruthy()
    expect(useCommentsStore.getState().commentsByDir[DIR]).toHaveLength(1)
    expect(window.fs.writeFile).toHaveBeenCalledWith(
      '/repo/.broomy/comments.json',
      expect.stringContaining('"body": "hi"'),
    )
  })

  it('updateComment edits an existing body', () => {
    const c = useCommentsStore.getState().addComment(DIR, { file: FILE, line: 5, quotedText: 'q', body: 'hi' })
    useCommentsStore.getState().updateComment(DIR, c.id, 'edited')
    expect(useCommentsStore.getState().commentsByDir[DIR][0].body).toBe('edited')
  })

  it('resolveComment removes one comment', () => {
    const c = useCommentsStore.getState().addComment(DIR, { file: FILE, line: 5, quotedText: 'q', body: 'hi' })
    useCommentsStore.getState().resolveComment(DIR, c.id)
    expect(useCommentsStore.getState().commentsByDir[DIR]).toEqual([])
  })

  it('clearComments empties the dir and persists an empty list', () => {
    useCommentsStore.getState().addComment(DIR, { file: FILE, line: 5, quotedText: 'q', body: 'hi' })
    vi.clearAllMocks()
    useCommentsStore.getState().clearComments(DIR)
    expect(useCommentsStore.getState().commentsByDir[DIR]).toEqual([])
    expect(window.fs.writeFile).toHaveBeenCalledWith('/repo/.broomy/comments.json', '[]')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/renderer/store/comments.test.ts`
Expected: FAIL — cannot find module `./comments`.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/store/comments.ts`:

```ts
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

async function persist(dir: string, comments: Comment[]): Promise<void> {
  try {
    await window.fs.mkdir(`${dir}/.broomy`)
    await window.fs.writeFile(commentsFilePathFor(dir), JSON.stringify(comments, null, 2))
  } catch {
    // Persistence failure is non-fatal; in-memory state remains authoritative.
  }
}

interface CommentsStore {
  commentsByDir: Record<string, Comment[]>
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
    void persist(sessionDir, next)
    return comment
  },

  updateComment: (sessionDir, id, body) => {
    const next = (get().commentsByDir[sessionDir] ?? []).map((c) =>
      c.id === id ? { ...c, body: body.trim() } : c,
    )
    set((s) => ({ commentsByDir: { ...s.commentsByDir, [sessionDir]: next } }))
    void persist(sessionDir, next)
  },

  resolveComment: (sessionDir, id) => {
    const next = (get().commentsByDir[sessionDir] ?? []).filter((c) => c.id !== id)
    set((s) => ({ commentsByDir: { ...s.commentsByDir, [sessionDir]: next } }))
    void persist(sessionDir, next)
  },

  clearComments: (sessionDir) => {
    set((s) => ({ commentsByDir: { ...s.commentsByDir, [sessionDir]: [] } }))
    void persist(sessionDir, [])
  },
}))
```

Note: `clearComments`/persist writes `JSON.stringify([], null, 2)` which is `'[]'` — the test asserts exactly `'[]'`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/renderer/store/comments.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/store/comments.ts src/renderer/store/comments.test.ts
git commit -m "feat(comments): per-session comments store with .broomy persistence"
```

---

## Task 3: Under-the-line comment box hook + component

**Files:**
- Create: `src/renderer/panels/fileViewer/hooks/useCommentBox.ts`
- Create: `src/renderer/panels/fileViewer/components/InlineCommentBox.tsx`
- Test: `src/renderer/panels/fileViewer/components/InlineCommentBox.test.tsx`

**Interfaces:**
- Consumes: `monaco.editor.IStandaloneCodeEditor` via a ref.
- Produces:
  - `useCommentBox(editorRef): { boxLine: number | null; boxNode: HTMLDivElement | null; openBox: (line: number) => void; closeBox: () => void }`
  - `InlineCommentBox` (default export) with props `{ line: number; quotedText: string; onAdd: (body: string) => void; onCancel: () => void }`.

- [ ] **Step 1: Write the failing test (component only)**

Create `src/renderer/panels/fileViewer/components/InlineCommentBox.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import InlineCommentBox from './InlineCommentBox'

describe('InlineCommentBox', () => {
  it('calls onAdd with the typed body', () => {
    const onAdd = vi.fn()
    render(<InlineCommentBox line={3} quotedText="const x = 1" onAdd={onAdd} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Add a comment...'), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add comment' }))
    expect(onAdd).toHaveBeenCalledWith('hi')
  })

  it('disables Add when empty and calls onCancel', () => {
    const onCancel = vi.fn()
    render(<InlineCommentBox line={3} quotedText="x" onAdd={vi.fn()} onCancel={onCancel} />)
    expect(screen.getByRole('button', { name: 'Add comment' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel comment' }))
    expect(onCancel).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/renderer/panels/fileViewer/components/InlineCommentBox.test.tsx`
Expected: FAIL — cannot find module `./InlineCommentBox`.

- [ ] **Step 3: Write `InlineCommentBox.tsx`**

```tsx
/**
 * React comment input rendered (via portal) into a Monaco view zone directly
 * under the line being commented on. GitHub-style: shows the quoted line, a
 * textarea, and Add / Cancel. Cmd/Ctrl+Enter submits, Escape cancels.
 */
import { useState } from 'react'

interface InlineCommentBoxProps {
  line: number
  quotedText: string
  onAdd: (body: string) => void
  onCancel: () => void
}

export default function InlineCommentBox({ line, quotedText, onAdd, onCancel }: InlineCommentBoxProps) {
  const [body, setBody] = useState('')
  const canAdd = body.trim().length > 0
  return (
    <div className="mx-3 my-1 rounded border border-border bg-bg-secondary p-2 shadow-sm">
      <div className="mb-1 text-xs text-text-secondary truncate">
        Line {line}: <span className="font-mono">{quotedText.trim()}</span>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canAdd) onAdd(body)
          else if (e.key === 'Escape') onCancel()
        }}
        placeholder="Add a comment..."
        rows={2}
        autoFocus
        className="w-full resize-y rounded border border-border bg-bg-primary px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
      />
      <div className="mt-1 flex justify-end gap-2">
        <button
          onClick={onCancel}
          aria-label="Cancel comment"
          className="rounded px-2 py-1 text-xs text-text-secondary transition-colors hover:text-text-primary"
        >
          Cancel
        </button>
        <button
          onClick={() => onAdd(body)}
          disabled={!canAdd}
          aria-label="Add comment"
          className="rounded bg-accent px-2 py-1 text-xs text-on-accent transition-colors hover:bg-accent/80 disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Write `useCommentBox.ts`**

```ts
/**
 * Manages a single "comment box" Monaco view zone positioned under a given
 * line. Reserves vertical space via a view zone and exposes its DOM node so a
 * React portal can render the InlineCommentBox into it. Monaco keeps the zone
 * positioned correctly across scroll and layout.
 */
import { useCallback, useRef, useState } from 'react'
import type * as monaco from 'monaco-editor'

const BOX_HEIGHT_PX = 96

export function useCommentBox(
  editorRef: React.RefObject<monaco.editor.IStandaloneCodeEditor | null>,
) {
  const [boxLine, setBoxLine] = useState<number | null>(null)
  const [boxNode, setBoxNode] = useState<HTMLDivElement | null>(null)
  const zoneIdRef = useRef<string | null>(null)

  const closeBox = useCallback(() => {
    const editor = editorRef.current
    if (editor && zoneIdRef.current) {
      editor.changeViewZones((accessor) => {
        if (zoneIdRef.current) accessor.removeZone(zoneIdRef.current)
      })
    }
    zoneIdRef.current = null
    setBoxNode(null)
    setBoxLine(null)
  }, [editorRef])

  const openBox = useCallback((line: number) => {
    const editor = editorRef.current
    if (!editor) return
    // Remove any existing zone first.
    if (zoneIdRef.current) {
      editor.changeViewZones((accessor) => {
        if (zoneIdRef.current) accessor.removeZone(zoneIdRef.current)
      })
      zoneIdRef.current = null
    }
    const domNode = document.createElement('div')
    editor.changeViewZones((accessor) => {
      zoneIdRef.current = accessor.addZone({
        afterLineNumber: line,
        heightInPx: BOX_HEIGHT_PX,
        domNode,
      })
    })
    setBoxNode(domNode)
    setBoxLine(line)
  }, [editorRef])

  return { boxLine, boxNode, openBox, closeBox }
}
```

- [ ] **Step 5: Run the component test to verify it passes**

Run: `pnpm vitest run src/renderer/panels/fileViewer/components/InlineCommentBox.test.tsx`
Expected: PASS. (`useCommentBox` is exercised via the viewers and E2E, not unit-tested — it is pure Monaco glue.)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/panels/fileViewer/hooks/useCommentBox.ts src/renderer/panels/fileViewer/components/InlineCommentBox.tsx src/renderer/panels/fileViewer/components/InlineCommentBox.test.tsx
git commit -m "feat(comments): under-the-line comment box hook and component"
```

---

## Task 4: Rewire `useMonacoComments` onto the store

**Files:**
- Modify: `src/renderer/panels/fileViewer/hooks/useMonacoComments.ts` (whole file)

**Interfaces:**
- Consumes: `useCommentsStore` (Task 2), `Comment` from `store/commentsFormat`.
- Produces: `useMonacoComments({ filePath, commentsContext, editorRef })` returning
  `{ existingComments: Comment[]; addCommentAt: (line: number, body: string) => void }`.
  The old `commentLine`/`commentText`/`handleAddComment` API is removed — the viewers now own the box via `useCommentBox`.
- `interface CommentsContext { sessionDirectory: string; commentsFilePath: string }` (renamed from `ReviewContext`; shape unchanged).

- [ ] **Step 1: Replace the file contents**

Replace `src/renderer/panels/fileViewer/hooks/useMonacoComments.ts` entirely with:

```ts
/**
 * Bridges the Monaco editor to the comments store: loads a session's comments,
 * renders glyph-margin markers for existing comments on the open file, and
 * exposes an add helper that captures the quoted line text at creation time.
 */
import { useEffect, useCallback, useRef } from 'react'
import * as monaco from 'monaco-editor'
import { useCommentsStore, type Comment } from '../../../store/comments'

export interface CommentsContext {
  sessionDirectory: string
  commentsFilePath: string
}

interface UseMonacoCommentsParams {
  filePath: string
  commentsContext?: CommentsContext
  editorRef: React.RefObject<monaco.editor.IStandaloneCodeEditor | null>
}

interface UseMonacoCommentsResult {
  existingComments: Comment[]
  addCommentAt: (line: number, body: string) => void
}

export function useMonacoComments({ filePath, commentsContext, editorRef }: UseMonacoCommentsParams): UseMonacoCommentsResult {
  const dir = commentsContext?.sessionDirectory
  const loadComments = useCommentsStore((s) => s.loadComments)
  const addComment = useCommentsStore((s) => s.addComment)
  const allForDir = useCommentsStore((s) => (dir ? s.commentsByDir[dir] : undefined))
  const decorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null)

  // Load this session's comments once the dir is known / changes.
  useEffect(() => {
    if (dir && allForDir === undefined) void loadComments(dir)
  }, [dir, allForDir, loadComments])

  const existingComments = (allForDir ?? []).filter((c) => c.file === filePath)

  // Render markers for existing comments on the current file.
  useEffect(() => {
    if (!editorRef.current || !commentsContext) return
    const editor = editorRef.current
    if (!editor.getModel()) return
    const decorations: monaco.editor.IModelDeltaDecoration[] = existingComments.map((c) => ({
      range: new monaco.Range(c.line, 1, c.line, 1),
      options: {
        isWholeLine: true,
        glyphMarginClassName: 'review-comment-glyph',
        glyphMarginHoverMessage: { value: c.body },
        className: 'review-comment-line',
      },
    }))
    decorationsRef.current?.clear()
    decorationsRef.current = editor.createDecorationsCollection(decorations)
  }, [existingComments, commentsContext, editorRef])

  const addCommentAt = useCallback((line: number, body: string) => {
    if (!dir || !body.trim()) return
    const model = editorRef.current?.getModel()
    const quotedText = model ? model.getLineContent(line) : ''
    addComment(dir, { file: filePath, line, quotedText, body })
  }, [dir, filePath, addComment, editorRef])

  return { existingComments, addCommentAt }
}
```

- [ ] **Step 2: Typecheck the hook in isolation**

Run: `pnpm vitest run src/renderer/store/comments.test.ts` (still green — no behavior change to the store) and confirm the project still type-resolves by proceeding; full typecheck runs in `/validate`. The viewers in Task 5 consume this new API.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/panels/fileViewer/hooks/useMonacoComments.ts
git commit -m "refactor(comments): drive useMonacoComments from the comments store"
```

---

## Task 5: Discoverable capture in the Monaco viewers + prop rename

**Files:**
- Modify: `src/renderer/panels/fileViewer/viewers/MonacoViewer.tsx`
- Modify: `src/renderer/panels/fileViewer/viewers/MonacoDiffViewer.tsx`
- Modify: `src/renderer/panels/fileViewer/viewers/types.ts`
- Modify: `src/renderer/panels/fileViewer/FileViewer.tsx`

**Interfaces:**
- Consumes: `useMonacoComments` (Task 4), `useCommentBox` + `InlineCommentBox` (Task 3).
- Produces: viewers accept `commentsContext?: { sessionDirectory: string; commentsFilePath: string }` (renamed from `reviewContext`).

**Behavior to implement in each Monaco viewer (the modified editor for the diff):**
1. Enable `glyphMargin` when `commentsContext` is set (already done via `!!reviewContext` — rename).
2. **Hover "+":** on `editor.onMouseMove`, track the hovered line and maintain a single decoration with `glyphMarginClassName: 'add-comment-glyph'` + `glyphMarginHoverMessage: { value: 'Add comment' }`; clear it on `editor.onMouseLeave`.
3. **Click to open:** existing `onMouseDown` on `GUTTER_GLYPH_MARGIN` calls `openBox(lineNumber)` (from `useCommentBox`) instead of `setCommentLine`.
4. **Render the box:** where `boxNode` is non-null, render `createPortal(<InlineCommentBox line={boxLine} quotedText={model.getLineContent(boxLine)} onAdd={(body)=>{ addCommentAt(boxLine, body); closeBox() }} onCancel={closeBox} />, boxNode)`.
5. Remove the old top-bar comment `<input>` block entirely.

- [ ] **Step 1: Rename the prop across the viewer contract**

In `src/renderer/panels/fileViewer/viewers/types.ts` rename the `reviewContext?: { sessionDirectory: string; commentsFilePath: string }` field on `FileViewerComponentProps` to `commentsContext?: { sessionDirectory: string; commentsFilePath: string }`.

In `src/renderer/panels/fileViewer/FileViewer.tsx`:
- Change the prop type field (line ~41) and the destructure (line ~47) from `reviewContext` to `commentsContext`.
- Change both pass-downs (lines ~167, ~181) to `commentsContext={commentsContext}`.

- [ ] **Step 2: Update `MonacoViewer.tsx`**

Add imports at the top:

```tsx
import { createPortal } from 'react-dom'
import { useCommentBox } from '../hooks/useCommentBox'
import InlineCommentBox from '../components/InlineCommentBox'
```

Replace the `useMonacoComments` destructure (lines ~208-212) with:

```tsx
const { addCommentAt } = useMonacoComments({ filePath, commentsContext, editorRef })
const { boxLine, boxNode, openBox, closeBox } = useCommentBox(editorRef)
```

Rename the `reviewContext` param in `MonacoViewerComponent`'s signature (line ~187) to `commentsContext`.

Replace the glyph-margin `onMouseDown` block (lines ~287-298) with hover + click wiring:

```tsx
// Comment gutter: hover shows an "add comment" affordance; click opens the box.
if (commentsContext) {
  let hoverDecorations = editor.createDecorationsCollection([])
  editor.onMouseMove((e) => {
    const line = e.target.position?.lineNumber
    if (line && e.target.type === monacoInstance.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
      hoverDecorations.set([{
        range: new monacoInstance.Range(line, 1, line, 1),
        options: { glyphMarginClassName: 'add-comment-glyph', glyphMarginHoverMessage: { value: 'Add comment' } },
      }])
    } else {
      hoverDecorations.clear()
    }
  })
  editor.onMouseLeave(() => hoverDecorations.clear())
  editor.onMouseDown((e) => {
    if (e.target.type === monacoInstance.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
      const lineNumber = e.target.position?.lineNumber
      if (lineNumber) openBox(lineNumber)
    }
  })
}
```

Replace the old top-bar comment `<input>` JSX block (lines ~351-386) with the portal render, placed just before the `<div className="flex-1 min-h-0">` editor wrapper:

```tsx
{boxNode && boxLine !== null && createPortal(
  <InlineCommentBox
    line={boxLine}
    quotedText={editorRef.current?.getModel()?.getLineContent(boxLine) ?? ''}
    onAdd={(body) => { addCommentAt(boxLine, body); closeBox() }}
    onCancel={closeBox}
  />,
  boxNode,
)}
```

Update `glyphMargin: !!reviewContext` → `glyphMargin: !!commentsContext` (line ~406). Update the `{reviewContext && (<style>…)}` block (line ~411) to `{commentsContext && (` and add the `add-comment-glyph` rule inside the existing `<style>`:

```css
.add-comment-glyph {
  color: rgb(var(--color-accent));
  cursor: pointer;
}
.add-comment-glyph::before {
  content: '+';
  display: block;
  text-align: center;
  font-weight: 700;
  line-height: 1;
}
```

- [ ] **Step 3: Update `MonacoDiffViewer.tsx`**

- Rename the prop field on `MonacoDiffViewerProps` (line ~26) and the destructure (line ~91) from `reviewContext` to `commentsContext`.
- Add the same three imports (`createPortal`, `useCommentBox`, `InlineCommentBox`).
- Replace the `useMonacoComments` destructure (lines ~100-110) with:

```tsx
const { addCommentAt } = useMonacoComments({ filePath, commentsContext, editorRef: modifiedEditorRef })
const { boxLine, boxNode, openBox, closeBox } = useCommentBox(modifiedEditorRef)
```

- In `handleDiffEditorMount`, replace the `if (reviewContext) { … onMouseDown … setCommentLine … }` block (lines ~117-127) with the hover + click wiring (same as MonacoViewer, but using `modifiedEditor` and `monacoEditor` as the monaco namespace):

```tsx
if (commentsContext) {
  modifiedEditor.updateOptions({ glyphMargin: true })
  const hoverDecorations = modifiedEditor.createDecorationsCollection([])
  modifiedEditor.onMouseMove((e) => {
    const line = e.target.position?.lineNumber
    if (line && e.target.type === monacoEditor.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
      hoverDecorations.set([{
        range: new monacoEditor.Range(line, 1, line, 1),
        options: { glyphMarginClassName: 'add-comment-glyph', glyphMarginHoverMessage: { value: 'Add comment' } },
      }])
    } else {
      hoverDecorations.clear()
    }
  })
  modifiedEditor.onMouseLeave(() => hoverDecorations.clear())
  modifiedEditor.onMouseDown((e) => {
    if (e.target.type === monacoEditor.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
      const lineNumber = e.target.position?.lineNumber
      if (lineNumber) openBox(lineNumber)
    }
  })
}
```

- Replace the top-bar comment `<input>` JSX (lines ~168-203) with the portal render placed just before the `{/* Diff Editor */}` wrapper:

```tsx
{boxNode && boxLine !== null && createPortal(
  <InlineCommentBox
    line={boxLine}
    quotedText={modifiedEditorRef.current?.getModel()?.getLineContent(boxLine) ?? ''}
    onAdd={(body) => { addCommentAt(boxLine, body); closeBox() }}
    onCancel={closeBox}
  />,
  boxNode,
)}
```

- Update `glyphMargin: !!reviewContext` → `glyphMargin: !!commentsContext` (line ~237). The `review-comment-glyph`/`add-comment-glyph` CSS lives in `MonacoViewer`'s `<style>`; add the same `<style>` block guarded by `commentsContext` to the diff viewer's returned JSX so decorations are styled there too (copy the `review-comment-glyph`, `review-comment-line`, `.margin-view-overlays .cgmr`, and `add-comment-glyph` rules from MonacoViewer).

- [ ] **Step 4: Verify the existing viewer/hook tests still pass**

Run: `pnpm vitest run src/renderer/panels/fileViewer`
Expected: PASS (InlineCommentBox test green; no viewer unit tests broken). Any test referencing the old `reviewContext` prop or `handleAddComment` must be updated to the new names as part of this step.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/panels/fileViewer
git commit -m "feat(comments): discoverable hover-+ capture and inline box in Monaco viewers"
```

---

## Task 6: Ungate comments to all sessions

**Files:**
- Modify: `src/renderer/hooks/usePanelsMap.tsx:248-252`

**Interfaces:**
- Consumes: the renamed `commentsContext` prop on `FileViewer` (Task 5).
- Produces: `commentsContext` is populated for every session.

- [ ] **Step 1: Replace the gated prop**

In `src/renderer/hooks/usePanelsMap.tsx`, change the `reviewContext={session.sessionType === 'review' ? { … } : undefined}` (lines ~248-251) to:

```tsx
commentsContext={{
  sessionDirectory: session.directory,
  commentsFilePath: `${session.directory}/.broomy/comments.json`,
}}
```

Leave the `prFilesUrl={session.sessionType === 'review' && …}` line unchanged (PR files remain review-only).

- [ ] **Step 2: Verify build-relevant tests pass**

Run: `pnpm vitest run src/renderer/hooks`
Expected: PASS (or no tests for this file — that's fine; full typecheck is in `/validate`).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/hooks/usePanelsMap.tsx
git commit -m "feat(comments): enable inline comments on all sessions, not just review"
```

---

## Task 7: CommentsDock component

**Files:**
- Create: `src/renderer/panels/explorer/CommentsDock.tsx`
- Create: `src/renderer/panels/explorer/CommentsDock.test.tsx`
- Create: `src/renderer/panels/explorer/CommentsDock.stories.tsx`

**Interfaces:**
- Consumes: `useCommentsStore` (Task 2), `formatCommentsForAgent` + `toRelativePath` (Task 1), `sendAgentPrompt` from `shared/utils/focusHelpers`.
- Produces: `CommentsDock` (default export) with props
  `{ directory: string; agentPtyId?: string; onNavigate: (file: string, line: number) => void }`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/panels/explorer/CommentsDock.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CommentsDock from './CommentsDock'
import { useCommentsStore } from '../../store/comments'

const DIR = '/repo'

describe('CommentsDock', () => {
  beforeEach(() => {
    useCommentsStore.setState({ commentsByDir: { [DIR]: [] } })
    vi.clearAllMocks()
    vi.mocked(window.pty.write).mockResolvedValue(undefined as unknown as void)
  })

  it('shows an empty state when there are no comments', () => {
    render(<CommentsDock directory={DIR} agentPtyId="pty1" onNavigate={vi.fn()} />)
    expect(screen.getByText(/no comments/i)).toBeInTheDocument()
  })

  it('lists comment summaries and navigates on click', () => {
    useCommentsStore.setState({ commentsByDir: { [DIR]: [
      { id: 'c1', file: '/repo/src/a.ts', line: 42, quotedText: 'const x = 1', body: 'why 1?', createdAt: 't' },
    ] } })
    const onNavigate = vi.fn()
    render(<CommentsDock directory={DIR} agentPtyId="pty1" onNavigate={onNavigate} />)
    fireEvent.click(screen.getByText(/src\/a\.ts:42/))
    expect(onNavigate).toHaveBeenCalledWith('/repo/src/a.ts', 42)
  })

  it('submit sends the formatted block to the agent and clears comments', async () => {
    useCommentsStore.setState({ commentsByDir: { [DIR]: [
      { id: 'c1', file: '/repo/src/a.ts', line: 42, quotedText: 'const x = 1', body: 'why 1?', createdAt: 't' },
    ] } })
    render(<CommentsDock directory={DIR} agentPtyId="pty1" onNavigate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))
    await vi.waitFor(() => expect(window.pty.write).toHaveBeenCalled())
    expect(vi.mocked(window.pty.write).mock.calls[0][1]).toContain('1.) src/a.ts:42: "const x = 1"')
    expect(useCommentsStore.getState().commentsByDir[DIR]).toEqual([])
  })

  it('disables submit when no agent is attached', () => {
    useCommentsStore.setState({ commentsByDir: { [DIR]: [
      { id: 'c1', file: '/repo/src/a.ts', line: 1, quotedText: 'x', body: 'b', createdAt: 't' },
    ] } })
    render(<CommentsDock directory={DIR} agentPtyId={undefined} onNavigate={vi.fn()} />)
    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled()
  })

  it('resolve removes a comment from the list', () => {
    useCommentsStore.setState({ commentsByDir: { [DIR]: [
      { id: 'c1', file: '/repo/src/a.ts', line: 1, quotedText: 'x', body: 'b', createdAt: 't' },
    ] } })
    render(<CommentsDock directory={DIR} agentPtyId="pty1" onNavigate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /resolve comment/i }))
    expect(useCommentsStore.getState().commentsByDir[DIR]).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/renderer/panels/explorer/CommentsDock.test.tsx`
Expected: FAIL — cannot find module `./CommentsDock`.

- [ ] **Step 3: Write `CommentsDock.tsx`**

```tsx
/**
 * Docked, collapsible/resizable list of accumulated review comments, pinned to
 * the bottom of the explorer across all tabs. Each row navigates to its file
 * and line; rows can be resolved (removed). "Submit" sends every pending
 * comment to the agent as one numbered feedback block, then clears the list.
 */
import { useEffect, useRef, useState } from 'react'
import { useCommentsStore } from '../../store/comments'
import { formatCommentsForAgent, toRelativePath } from '../../store/commentsFormat'
import { sendAgentPrompt } from '../../shared/utils/focusHelpers'

interface CommentsDockProps {
  directory: string
  agentPtyId?: string
  onNavigate: (file: string, line: number) => void
}

const MIN_HEIGHT = 80
const MAX_HEIGHT = 420
const HEIGHT_KEY = 'broomy.commentsDock.height'

export default function CommentsDock({ directory, agentPtyId, onNavigate }: CommentsDockProps) {
  const comments = useCommentsStore((s) => s.commentsByDir[directory] ?? [])
  const loadComments = useCommentsStore((s) => s.loadComments)
  const resolveComment = useCommentsStore((s) => s.resolveComment)
  const clearComments = useCommentsStore((s) => s.clearComments)
  const loaded = useCommentsStore((s) => s.commentsByDir[directory] !== undefined)

  const [collapsed, setCollapsed] = useState(false)
  const [height, setHeight] = useState(() => {
    const saved = Number(localStorage.getItem(HEIGHT_KEY))
    return saved >= MIN_HEIGHT && saved <= MAX_HEIGHT ? saved : 160
  })
  const draggingRef = useRef(false)

  useEffect(() => {
    if (!loaded) void loadComments(directory)
  }, [loaded, directory, loadComments])

  // Drag-to-resize: dragging the top handle changes height (grows upward).
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return
      const fromBottom = window.innerHeight - e.clientY
      const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, fromBottom))
      setHeight(next)
    }
    const onUp = () => {
      if (draggingRef.current) localStorage.setItem(HEIGHT_KEY, String(height))
      draggingRef.current = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [height])

  const handleSubmit = async () => {
    if (!agentPtyId || comments.length === 0) return
    await sendAgentPrompt(agentPtyId, formatCommentsForAgent(comments, directory))
    clearComments(directory)
  }

  return (
    <div className="flex-shrink-0 border-t border-border bg-bg-secondary">
      {/* Resize handle (only when expanded) */}
      {!collapsed && (
        <div
          onMouseDown={() => { draggingRef.current = true }}
          className="h-1 w-full cursor-row-resize hover:bg-accent/60"
        />
      )}
      {/* Header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-bg-tertiary"
      >
        <span>Comments{comments.length > 0 ? ` (${comments.length})` : ''}</span>
        <span className="text-text-secondary">{collapsed ? '▲' : '▼'}</span>
      </button>

      {!collapsed && (
        <div className="flex flex-col" style={{ height }}>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {comments.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-text-secondary">
                No comments yet. Hover a line in a file and click + to add one.
              </div>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="group flex items-start gap-2 border-b border-border px-3 py-1.5 text-xs">
                  <button
                    onClick={() => onNavigate(c.file, c.line)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="text-accent">{toRelativePath(c.file, directory)}:{c.line}</span>
                    <span className="ml-1 text-text-secondary truncate"> — {c.body}</span>
                  </button>
                  <button
                    onClick={() => resolveComment(directory, c.id)}
                    aria-label="Resolve comment"
                    className="opacity-0 transition-opacity group-hover:opacity-100 text-text-secondary hover:text-text-primary"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="flex-shrink-0 border-t border-border p-2">
            <button
              onClick={handleSubmit}
              disabled={comments.length === 0 || !agentPtyId}
              title={!agentPtyId ? 'The agent is not running' : undefined}
              className="w-full rounded bg-accent px-2 py-1 text-xs text-on-accent transition-colors hover:bg-accent/80 disabled:opacity-50"
            >
              Submit {comments.length} comment{comments.length === 1 ? '' : 's'} to agent
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/renderer/panels/explorer/CommentsDock.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write Storybook stories**

Create `src/renderer/panels/explorer/CommentsDock.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { useEffect } from 'react'
import CommentsDock from './CommentsDock'
import { useCommentsStore, type Comment } from '../../store/comments'

const DIR = '/repo'
const seed = (comments: Comment[]) => {
  useCommentsStore.setState({ commentsByDir: { [DIR]: comments } })
}

const meta: Meta<typeof CommentsDock> = {
  title: 'Explorer/CommentsDock',
  component: CommentsDock,
  decorators: [(Story, ctx) => {
    useEffect(() => { seed((ctx.parameters.seed as Comment[]) ?? []) }, [ctx.parameters.seed])
    return <div style={{ width: 320 }}><Story /></div>
  }],
}
export default meta
type Story = StoryObj<typeof CommentsDock>

export const Empty: Story = {
  args: { directory: DIR, agentPtyId: 'pty1', onNavigate: () => {} },
  parameters: { seed: [] },
}

export const WithComments: Story = {
  args: { directory: DIR, agentPtyId: 'pty1', onNavigate: () => {} },
  parameters: { seed: [
    { id: 'c1', file: '/repo/src/a.ts', line: 42, quotedText: 'const x = 1', body: 'Why 1 and not a constant?', createdAt: 't' },
    { id: 'c2', file: '/repo/src/b.ts', line: 7, quotedText: 'return null', body: 'Add a test for the null path', createdAt: 't' },
  ] },
}

export const NoAgent: Story = {
  args: { directory: DIR, agentPtyId: undefined, onNavigate: () => {} },
  parameters: { seed: [
    { id: 'c1', file: '/repo/src/a.ts', line: 42, quotedText: 'const x = 1', body: 'Why 1?', createdAt: 't' },
  ] },
}
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/panels/explorer/CommentsDock.tsx src/renderer/panels/explorer/CommentsDock.test.tsx src/renderer/panels/explorer/CommentsDock.stories.tsx
git commit -m "feat(comments): docked comments list with submit-to-agent"
```

---

## Task 8: Mount CommentsDock in the explorer

**Files:**
- Modify: `src/renderer/panels/explorer/ExplorerPanel.tsx`

**Interfaces:**
- Consumes: `CommentsDock` (Task 7). `directory`, `agentPtyId`, `onFileSelect` already exist as Explorer props.

- [ ] **Step 1: Import and render the dock**

Add the import near the other panel imports in `ExplorerPanel.tsx`:

```tsx
import CommentsDock from './CommentsDock'
```

Immediately AFTER the closing `</div>` of the `{/* Tab content … */}` scrollable container (the `<div className="flex-1 min-h-0 overflow-y-auto">…</div>` block that ends at line ~197) and BEFORE the outer container's closing `</div>`, add:

```tsx
{directory && (
  <CommentsDock
    directory={directory}
    agentPtyId={agentPtyId}
    onNavigate={(file, line) => onFileSelect?.({ filePath: file, scrollToLine: line, openInDiffMode: false })}
  />
)}
```

Because the outer container is `flex flex-col` and the tab content is `flex-1`, the dock (a `flex-shrink-0` element) naturally pins to the bottom across every tab.

- [ ] **Step 2: Verify explorer tests pass**

Run: `pnpm vitest run src/renderer/panels/explorer`
Expected: PASS (CommentsDock test green; no existing explorer test broken).

- [ ] **Step 3: Manual smoke check**

Run: `pnpm dev`. Open a session, open any file, hover a line → a blue "+" appears in the gutter; click it → a comment box opens under the line; type + Add → the comment appears in the "Comments" section docked at the bottom of the explorer. Collapse/expand via the header; drag the top handle to resize. Click a row → navigates to the file+line. With the agent running, "Submit" pastes the numbered block into the terminal and clears the list.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/panels/explorer/ExplorerPanel.tsx
git commit -m "feat(comments): dock the comments panel at the bottom of the explorer"
```

---

## Task 9: E2E coverage

**Files:**
- Create: `tests/e2e/diff-comments.spec.ts`

**Interfaces:**
- Consumes: the running app under `E2E_TEST=true`. Follow patterns in the existing `tests/e2e/` specs (locate one first to copy the app-launch/session-open helpers).

- [ ] **Step 1: Inspect an existing E2E spec for the launch/select-session helpers**

Read one spec under `tests/e2e/` to reuse its Electron launch + "open a session" + "open the explorer" helpers. Match its imports and setup exactly.

- [ ] **Step 2: Write the E2E test**

Create `tests/e2e/diff-comments.spec.ts` following that spec's structure. Assert, at minimum:
1. After launching and selecting the first mock session, the explorer shows a **"Comments"** header (the docked panel is present on a normal, non-review session — proving the ungate).
2. Clicking the "Comments" header toggles the body collapsed/expanded (the chevron flips ▼/▲).
3. The empty state text "No comments yet." is visible when expanded with no comments.

Keep interactions to DOM-level assertions on the dock (do not attempt to drive Monaco glyph-margin clicks — those are covered by unit tests and manual verification). Use the same `test`/`expect` imports and `electronApp` fixtures as the neighboring specs.

- [ ] **Step 3: Run the E2E spec**

Run: `pnpm test:e2e` (or the project's documented single-spec form if the neighboring specs show one).
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/diff-comments.spec.ts
git commit -m "test(comments): e2e for the docked comments panel"
```

---

## Task 10: Verification & docs

- [ ] **Step 1: Update Storybook reference images**

If `/validate` / storybook diff flags the new `CommentsDock` stories as missing references, accept them:

Run: `pnpm storybook:update-refs`
Then review the added images under `.storybook-refs/` and commit them.

- [ ] **Step 2: Run `/validate`**

Invoke the `/validate` skill. It runs lint, typecheck, check:all, unit tests, coverage (≥90%), and E2E, and fixes failures. Do not proceed until it is green. If coverage on any new file is below 90%, add focused tests (the store, formatter, and dock have the most logic to cover).

- [ ] **Step 3: Feature walkthrough doc**

Invoke `/feature-doc diff-comments` to create the required screenshot walkthrough spec.

- [ ] **Step 4: Code review**

Invoke `/code-review` on the changed files and address findings.

- [ ] **Step 5: Final commit (if review produced changes)**

```bash
git add -A
git commit -m "chore(comments): address review feedback and finalize v1"
```

---

## Self-Review Notes (author)

- **Spec coverage:** data model/store (Tasks 1–2), discoverable capture + under-the-line box (Tasks 3, 5), ungate all sessions (Task 6), docked collapsible+resizable panel with per-row navigate/resolve (Tasks 7–8), submit-in-format-then-clear (Tasks 1, 7), error handling — agent-not-running disables submit (Task 7), file-write failure swallowed non-fatally (Task 2), per-session isolation via dir-keyed store (Task 2), line-drift accepted (snapshot only). Testing: unit (1,2,3,7), storybook (7,10), E2E (9). All spec sections map to a task.
- **Deferred correctly:** no reply parsing, threading, submitted-state, terminal-quote, or range selection — none appear in any task.
- **Type consistency:** `Comment` defined once in `commentsFormat.ts`, re-exported by `comments.ts`; `commentsContext: { sessionDirectory, commentsFilePath }` used identically across `types.ts`, `FileViewer.tsx`, both viewers, `useMonacoComments.ts`, and `usePanelsMap.tsx`; store action names (`loadComments`/`addComment`/`updateComment`/`resolveComment`/`clearComments`) used consistently in Tasks 2, 4, 7; `addCommentAt(line, body)` and `useCommentBox` returns (`boxLine`/`boxNode`/`openBox`/`closeBox`) match between Tasks 3, 4, 5.
