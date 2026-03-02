/**
 * Tests for built-in analysis definitions.
 */
import { describe, it, expect } from 'vitest'
import { BUILTIN_ANALYSES } from './analysisDefinitions'

describe('BUILTIN_ANALYSES', () => {
  it('has two built-in analyses', () => {
    expect(BUILTIN_ANALYSES).toHaveLength(2)
  })

  it('includes security and accessibility', () => {
    const ids = BUILTIN_ANALYSES.map(a => a.id)
    expect(ids).toEqual(['security', 'accessibility'])
  })

  it('all analyses have required fields', () => {
    for (const analysis of BUILTIN_ANALYSES) {
      expect(analysis.label).toBeTruthy()
      expect(analysis.description).toBeTruthy()
      expect(analysis.promptTemplate).toBeTruthy()
      expect(analysis.outputFile).toBeTruthy()
    }
  })

  it('output files follow the expected pattern', () => {
    for (const analysis of BUILTIN_ANALYSES) {
      expect(analysis.outputFile).toMatch(/^\.broomy\/analyses\/\w+\.json$/)
    }
  })
})
