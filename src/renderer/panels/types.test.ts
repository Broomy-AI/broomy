import { describe, it, expect } from 'vitest'
import { PANEL_IDS, DEFAULT_TOOLBAR_PANELS, MAX_SHORTCUT_PANELS } from './types'

describe('PANEL_IDS', () => {
  it('has expected panel IDs', () => {
    expect(PANEL_IDS.SIDEBAR).toBe('sidebar')
    expect(PANEL_IDS.EXPLORER).toBe('explorer')
    expect(PANEL_IDS.FILE_VIEWER).toBe('fileViewer')
    expect(PANEL_IDS.AGENT_TERMINAL).toBe('agentTerminal')
    expect(PANEL_IDS.USER_TERMINAL).toBe('userTerminal')
    expect(PANEL_IDS.SETTINGS).toBe('settings')
  })

  it('has 7 panel IDs', () => {
    expect(Object.keys(PANEL_IDS)).toHaveLength(7)
  })
})

describe('DEFAULT_TOOLBAR_PANELS', () => {
  it('contains all panel IDs', () => {
    expect(DEFAULT_TOOLBAR_PANELS).toEqual([
      'sidebar',
      'explorer',
      'review',
      'fileViewer',
      'agentTerminal',
      'userTerminal',
      'settings',
    ])
  })
})

describe('MAX_SHORTCUT_PANELS', () => {
  it('equals 6', () => {
    expect(MAX_SHORTCUT_PANELS).toBe(6)
  })
})
