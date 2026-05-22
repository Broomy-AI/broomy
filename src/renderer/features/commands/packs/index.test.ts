import { describe, it, expect } from 'vitest'
import { PACKS, getPack } from './index'
import { validateCommandsConfig } from '../commandsConfig'

describe('packs', () => {
  it('exposes Basics as the only starter pack', () => {
    expect(PACKS.map(p => p.id)).toEqual(['basics'])
  })

  it('every pack passes schema validation', () => {
    for (const p of PACKS) {
      expect(validateCommandsConfig({ version: 2, actions: p.actions })).toEqual([])
    }
  })

  it('getPack returns by id', () => {
    expect(getPack('basics')?.name).toBe('Basics')
    expect(getPack('missing')).toBeUndefined()
  })

  it('basics drives a brainstorm -> implement -> verify -> ship workflow via stages', () => {
    const basics = getPack('basics')!
    const ids = basics.actions.map(a => a.id)
    for (const id of ['brainstorm', 'verify', 'self-review', 'address-feedback']) {
      expect(ids).toContain(id)
    }
    const hasStageRef = basics.actions.some(a => a.stages || typeof a.setStage === 'string')
    expect(hasStageRef).toBe(true)
  })

  it('basics also covers the core git workflow under showWhen conditions', () => {
    const basics = getPack('basics')!
    const ids = basics.actions.map(a => a.id)
    for (const id of ['commit', 'resolve-conflicts', 'sync', 'push-branch', 'create-pr', 'review']) {
      expect(ids).toContain(id)
    }
  })

  it('basics has no requiresPlugin', () => {
    expect(getPack('basics')?.requiresPlugin).toBeUndefined()
  })
})
