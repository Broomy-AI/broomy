import { describe, it, expect } from 'vitest'
import { substituteTemplate } from './templateSubstitute'

const CTX = { main: 'main', branch: 'feat/x', directory: '/tmp/repo', issueNumber: '42' }

describe('substituteTemplate', () => {
  it('substitutes reserved context vars', () => {
    expect(substituteTemplate('Create a PR against {main}', { context: CTX, args: {} }))
      .toBe('Create a PR against main')
  })

  it('substitutes user args', () => {
    expect(substituteTemplate('/plan {topic}', { context: CTX, args: { topic: { value: 'auth' } } }))
      .toBe('/plan auth')
  })

  it('strips optional flag-group when arg is omitted', () => {
    expect(substituteTemplate(
      '/plan {topic} --depth {depth}',
      { context: CTX, args: { topic: { value: 'auth' }, depth: { value: '', enabled: false } } },
    )).toBe('/plan auth')
  })

  it('includes optional flag-group when arg is enabled', () => {
    expect(substituteTemplate(
      '/plan {topic} --depth {depth}',
      { context: CTX, args: { topic: { value: 'auth' }, depth: { value: '5', enabled: true } } },
    )).toBe('/plan auth --depth 5')
  })

  it('handles -short optional flag', () => {
    expect(substituteTemplate(
      '/x {a} -v {value}',
      { context: CTX, args: { a: { value: 'A' }, value: { value: '', enabled: false } } },
    )).toBe('/x A')
  })

  it('leaves bare reserved var empty when context lacks it', () => {
    expect(substituteTemplate('issue {issueNumber}', { context: { ...CTX, issueNumber: '' }, args: {} }))
      .toBe('issue ')
  })

  it('does not strip flag-groups for required (non-flag) args', () => {
    expect(substituteTemplate('/x {a}', { context: CTX, args: { a: { value: 'A' } } }))
      .toBe('/x A')
  })
})

describe('registry-wide context substitution', () => {
  it('substitutes the new context variables', () => {
    const result = substituteTemplate('/review {prTitle} on {branch} in {repoName}', {
      context: { prTitle: 'Fix login', branch: 'fix/login', repoName: 'broomy' },
      args: {},
    })
    expect(result).toBe('/review Fix login on fix/login in broomy')
  })

  it('substitutes an empty string for a context variable with no value', () => {
    const result = substituteTemplate('/pr {prNumber}', { context: { prNumber: '' }, args: {} })
    expect(result).toBe('/pr ')
  })

  it('leaves unknown placeholders untouched', () => {
    const result = substituteTemplate('/x {notAVar}', { context: { branch: 'b' }, args: {} })
    expect(result).toBe('/x {notAVar}')
  })

  it('prefers a context variable over an arg of the same name', () => {
    const result = substituteTemplate('/x {branch}', {
      context: { branch: 'from-context' },
      args: { branch: { value: 'from-arg' } },
    })
    expect(result).toBe('/x from-context')
  })
})
