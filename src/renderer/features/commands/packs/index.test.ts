import { describe, it, expect } from 'vitest'
import { PACKS, getPack } from './index'
import { validateCommandsConfig } from '../commandsConfig'

describe('packs', () => {
  it('exposes superpowers (recommended) first, then gstack, then basics', () => {
    expect(PACKS.map(p => p.id)).toEqual(['superpowers', 'gstack', 'basics'])
  })

  it('superpowers and gstack include the core Basics workflow commands', () => {
    const sp = getPack('superpowers')!
    const gs = getPack('gstack')!
    const basicsIds = ['commit', 'resolve-conflicts', 'push-branch', 'create-pr', 'review']
    for (const id of basicsIds) {
      expect(sp.actions.find(a => a.id === id), `superpowers missing ${id}`).toBeDefined()
      expect(gs.actions.find(a => a.id === id), `gstack missing ${id}`).toBeDefined()
    }
  })

  it('packs with requiresPlugin name their plugin', () => {
    expect(getPack('superpowers')?.requiresPlugin?.name).toBe('Superpowers')
    expect(getPack('gstack')?.requiresPlugin?.name).toBe('gstack')
    expect(getPack('basics')?.requiresPlugin).toBeUndefined()
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

  it('basics has no stages or setStage', () => {
    const basics = getPack('basics')!
    for (const a of basics.actions) {
      expect(a.stages).toBeUndefined()
      expect(a.setStage).toBeUndefined()
    }
  })

  it('superpowers uses stages', () => {
    const sp = getPack('superpowers')!
    const hasStageRef = sp.actions.some(a => a.stages || typeof a.setStage === 'string')
    expect(hasStageRef).toBe(true)
  })
})
