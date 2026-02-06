import { describe, it, expect } from 'vitest'
import { getFileExtension, matchesExtensions } from './types'

describe('getFileExtension', () => {
  it('returns the file extension', () => {
    expect(getFileExtension('file.ts')).toBe('ts')
  })

  it('returns the last extension for dotted names', () => {
    expect(getFileExtension('file.test.ts')).toBe('ts')
  })

  it('lowercases the extension', () => {
    expect(getFileExtension('file.TSX')).toBe('tsx')
  })

  it('returns empty string for files with no dot', () => {
    expect(getFileExtension('Makefile')).toBe('makefile')
  })

  it('handles paths with directories', () => {
    expect(getFileExtension('src/components/App.tsx')).toBe('tsx')
  })

  it('handles dotfiles', () => {
    expect(getFileExtension('.gitignore')).toBe('gitignore')
  })

  it('returns empty string for empty path', () => {
    expect(getFileExtension('')).toBe('')
  })
})

describe('matchesExtensions', () => {
  it('returns true when extension matches', () => {
    expect(matchesExtensions('file.ts', ['ts', 'tsx'])).toBe(true)
  })

  it('returns false when extension does not match', () => {
    expect(matchesExtensions('file.js', ['ts', 'tsx'])).toBe(false)
  })

  it('is case insensitive', () => {
    expect(matchesExtensions('file.TSX', ['tsx'])).toBe(true)
  })

  it('returns false for empty extensions list', () => {
    expect(matchesExtensions('file.ts', [])).toBe(false)
  })
})
