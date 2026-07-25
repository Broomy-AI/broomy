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
