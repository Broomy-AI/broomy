import { describe, it, expect } from 'vitest'
import { parseTemplate, RESERVED_CONTEXT_VARS } from './templateParser'

describe('parseTemplate', () => {
  it('extracts a single bare placeholder', () => {
    const r = parseTemplate('/plan {topic}')
    expect(r.args).toEqual([{ name: 'topic', optional: false, flag: null }])
  })

  it('extracts multiple bare placeholders in order', () => {
    const r = parseTemplate('/plan {a} {b} {c}')
    expect(r.args.map(a => a.name)).toEqual(['a', 'b', 'c'])
  })

  it('detects optional flag group with --long flag', () => {
    const r = parseTemplate('/plan {topic} --depth {depth}')
    expect(r.args).toEqual([
      { name: 'topic', optional: false, flag: null },
      { name: 'depth', optional: true, flag: '--depth' },
    ])
  })

  it('detects optional flag group with -short flag', () => {
    const r = parseTemplate('/x {a} -v {value}')
    expect(r.args[1]).toEqual({ name: 'value', optional: true, flag: '-v' })
  })

  it('ignores reserved context vars', () => {
    const r = parseTemplate('Create a PR against {main} for {branch}, see {directory} and {issueNumber}')
    expect(r.args).toEqual([])
  })

  it('mixes reserved and user args', () => {
    const r = parseTemplate('On {branch}, run /plan {topic}')
    expect(r.args).toEqual([{ name: 'topic', optional: false, flag: null }])
  })

  it('returns empty args for text-block templates', () => {
    const r = parseTemplate('multi\nline\nprompt')
    expect(r.args).toEqual([])
  })

  it('deduplicates repeated placeholders', () => {
    const r = parseTemplate('/x {topic} again {topic}')
    expect(r.args).toEqual([{ name: 'topic', optional: false, flag: null }])
  })

  it('reserved set includes the canonical four', () => {
    expect(RESERVED_CONTEXT_VARS).toEqual(new Set(['main', 'branch', 'directory', 'issueNumber']))
  })

  it('flag-group beats bare when same name appears twice', () => {
    const r = parseTemplate('/x {topic} --topic-flag {topic}')
    // The flag-association pass runs to completion before the placeholder walk,
    // so the arg ends up flagged + optional regardless of which placeholder is hit first.
    expect(r.args).toEqual([{ name: 'topic', optional: true, flag: '--topic-flag' }])
  })
})
