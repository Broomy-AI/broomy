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
    expect(useCommentsStore.getState().commentsByDir[DIR]![0].body).toBe('edited')
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
