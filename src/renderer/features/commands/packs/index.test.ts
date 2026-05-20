import { describe, it, expect } from 'vitest'
import { PACKS, getPack } from './index'
import { validateCommandsConfig } from '../commandsConfig'

describe('packs', () => {
  it('exposes basics, superpowers, gstack', () => {
    expect(PACKS.map(p => p.id)).toEqual(['basics', 'superpowers', 'gstack'])
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
