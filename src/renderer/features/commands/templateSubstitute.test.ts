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
