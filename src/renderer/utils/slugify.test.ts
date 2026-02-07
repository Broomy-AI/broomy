import { describe, it, expect } from 'vitest'
import { issueToBranchName } from './slugify'

describe('issueToBranchName', () => {
  it('creates a branch name from issue number and title', () => {
    expect(issueToBranchName({ number: 42, title: 'Fix login bug' }))
      .toBe('42-fix-login-bug')
  })

  it('lowercases the title', () => {
    expect(issueToBranchName({ number: 1, title: 'Add NEW Feature' }))
      .toBe('1-add-new-feature')
  })

  it('removes special characters', () => {
    expect(issueToBranchName({ number: 5, title: "Can't fix it! @home" }))
      .toBe('5-cant-fix-it-home')
  })

  it('caps at 4 words', () => {
    expect(issueToBranchName({ number: 10, title: 'One two three four five six' }))
      .toBe('10-one-two-three-four')
  })

  it('handles extra whitespace', () => {
    expect(issueToBranchName({ number: 3, title: '  spaced   out  title  ' }))
      .toBe('3-spaced-out-title')
  })

  it('handles empty title', () => {
    expect(issueToBranchName({ number: 7, title: '' }))
      .toBe('7-')
  })
})
