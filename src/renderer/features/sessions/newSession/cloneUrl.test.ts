import { describe, it, expect } from 'vitest'
import { parseCloneUrl } from './cloneUrl'

describe('parseCloneUrl', () => {
  it('returns empty (no error) for empty input', () => {
    const r = parseCloneUrl('')
    expect(r).toEqual({ url: '', repoName: '', error: null })
  })

  it('returns empty (no error) for whitespace only', () => {
    const r = parseCloneUrl('   ')
    expect(r).toEqual({ url: '', repoName: '', error: null })
  })

  it('parses an HTTPS .git URL', () => {
    const r = parseCloneUrl('https://github.com/user/my-repo.git')
    expect(r).toEqual({
      url: 'https://github.com/user/my-repo.git',
      repoName: 'my-repo',
      error: null,
    })
  })

  it('parses an HTTPS URL without .git suffix', () => {
    const r = parseCloneUrl('https://github.com/user/my-repo')
    expect(r.url).toBe('https://github.com/user/my-repo')
    expect(r.repoName).toBe('my-repo')
    expect(r.error).toBeNull()
  })

  it('strips trailing slash and surrounding whitespace', () => {
    const r = parseCloneUrl('  https://github.com/user/my-repo/  ')
    expect(r.url).toBe('https://github.com/user/my-repo')
    expect(r.repoName).toBe('my-repo')
    expect(r.error).toBeNull()
  })

  it('strips surrounding quotes (common when copy-pasting)', () => {
    const r = parseCloneUrl('"https://github.com/user/my-repo.git"')
    expect(r.url).toBe('https://github.com/user/my-repo.git')
    expect(r.repoName).toBe('my-repo')
  })

  it('parses an SSH URL', () => {
    const r = parseCloneUrl('git@github.com:user/my-repo.git')
    expect(r).toEqual({
      url: 'git@github.com:user/my-repo.git',
      repoName: 'my-repo',
      error: null,
    })
  })

  it('parses an SSH URL without .git suffix', () => {
    const r = parseCloneUrl('git@github.com:user/my-repo')
    expect(r.repoName).toBe('my-repo')
    expect(r.error).toBeNull()
  })

  it('expands user/repo shorthand to GitHub HTTPS', () => {
    const r = parseCloneUrl('user/my-repo')
    expect(r.url).toBe('https://github.com/user/my-repo.git')
    expect(r.repoName).toBe('my-repo')
    expect(r.error).toBeNull()
  })

  it('rejects GitHub tree URLs with a clear error', () => {
    const r = parseCloneUrl('https://github.com/user/my-repo/tree/main')
    expect(r.url).toBe('')
    expect(r.repoName).toBe('')
    expect(r.error).toMatch(/tree page/)
    expect(r.error).toMatch(/my-repo/)
  })

  it('rejects GitHub blob URLs', () => {
    const r = parseCloneUrl('https://github.com/user/my-repo/blob/main/README.md')
    expect(r.error).toMatch(/blob page/)
  })

  it('rejects GitHub pulls URLs', () => {
    const r = parseCloneUrl('https://github.com/user/my-repo/pulls')
    expect(r.error).toMatch(/pulls page/)
  })

  it('rejects GitHub issues URLs', () => {
    const r = parseCloneUrl('https://github.com/user/my-repo/issues/42')
    expect(r.error).toMatch(/issues page/)
  })

  it('rejects URL missing repository path', () => {
    const r = parseCloneUrl('https://github.com/user')
    expect(r.error).toMatch(/missing the repository path/i)
  })

  it('rejects garbage input with explanation', () => {
    const r = parseCloneUrl('not a url at all')
    expect(r.error).toMatch(/HTTPS URL/i)
  })

  it('rejects an SSH URL missing the repo segment', () => {
    const r = parseCloneUrl('git@github.com:user')
    expect(r.error).toMatch(/missing the repository path/i)
  })

  it('handles GitLab/Bitbucket nested paths (group/subgroup/repo)', () => {
    const r = parseCloneUrl('https://gitlab.com/group/subgroup/my-repo.git')
    expect(r.url).toBe('https://gitlab.com/group/subgroup/my-repo.git')
    expect(r.repoName).toBe('my-repo')
    expect(r.error).toBeNull()
  })
})
