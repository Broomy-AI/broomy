import { describe, it, expect } from 'vitest'
import { issueToBranchName } from './slugify'

describe('issueToBranchName', () => {
  it('strips common words and keeps uncommon ones', () => {
    // "the" is common; fix, login, page, bug are uncommon (4 >= 3)
    expect(issueToBranchName({ number: 42, title: 'Fix the login page bug' }))
      .toBe('fix-login-page-bug')
  })

  it('lowercases the title', () => {
    expect(issueToBranchName({ number: 1, title: 'Add Authentication Middleware' }))
      .toBe('add-authentication-middleware')
  })

  it('removes special characters', () => {
    // "cant" (stripped can't) is common; render, mentions, properly are uncommon
    expect(issueToBranchName({ number: 5, title: "Can't render @mentions properly!" }))
      .toBe('render-mentions-properly')
  })

  it('does not prefix with issue number', () => {
    const result = issueToBranchName({ number: 99, title: 'Refactor database migrations' })
    expect(result).not.toMatch(/^99-/)
    expect(result).toBe('refactor-database-migrations')
  })

  it('preserves word order from original title', () => {
    expect(issueToBranchName({ number: 1, title: 'Webpack bundle analyzer integration' }))
      .toBe('webpack-bundle-analyzer-integration')
  })

  it('backfills with rarest common words when fewer than 3 uncommon words', () => {
    // "sidebar" and "tooltip" are uncommon, "display" is also uncommon (3 >= 3)
    expect(issueToBranchName({ number: 8, title: 'Display the sidebar tooltip' }))
      .toBe('display-sidebar-tooltip')
  })

  it('handles all common words by picking the rarest ones', () => {
    // "the" and "for" are common; rest are uncommon
    const result = issueToBranchName({ number: 3, title: 'This could be done well before now' })
    expect(result.split('-').length).toBeGreaterThanOrEqual(3)
  })

  it('handles empty title with fallback', () => {
    expect(issueToBranchName({ number: 7, title: '' }))
      .toBe('issue-7')
  })

  it('handles whitespace-only title with fallback', () => {
    expect(issueToBranchName({ number: 12, title: '   ' }))
      .toBe('issue-12')
  })

  it('handles single uncommon word by backfilling', () => {
    // "fix" is uncommon, "the" is common, "typo" is uncommon — 2 uncommon, backfills "the"
    const result = issueToBranchName({ number: 4, title: 'Fix the typo' })
    expect(result).toBe('fix-the-typo')
  })

  it('handles extra whitespace', () => {
    const result = issueToBranchName({ number: 3, title: '  spaced   out  title  ' })
    expect(result).toContain('spaced')
  })

  it('keeps all words when title has exactly 3 uncommon words', () => {
    expect(issueToBranchName({ number: 10, title: 'Cypress integration tests' }))
      .toBe('cypress-integration-tests')
  })

  it('produces concise names for realistic issue titles', () => {
    // "for", "in", "the", "support", "dark" are common; add, mode, settings, panel uncommon
    expect(issueToBranchName({ number: 155, title: 'Add support for dark mode in the settings panel' }))
      .toBe('add-mode-settings-panel')

    // "when", "the", "on" are common; rest uncommon
    expect(issueToBranchName({ number: 42, title: 'TypeError when clicking the submit button on mobile' }))
      .toBe('typeerror-clicking-submit-button-mobile')

    // "from", "to" are common; migrate, webpack, vite uncommon
    expect(issueToBranchName({ number: 88, title: 'Migrate from Webpack to Vite' }))
      .toBe('migrate-webpack-vite')
  })

  it('handles two-word titles by backfilling to at least 2', () => {
    const result = issueToBranchName({ number: 6, title: 'Fix crash' })
    expect(result.split('-').length).toBeGreaterThanOrEqual(2)
    expect(result).toContain('crash')
  })
})
