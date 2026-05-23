import { describe, it, expect } from 'vitest'
import { PANEL_IDS, DEFAULT_TOOLBAR_PANELS, MAX_SHORTCUT_PANELS } from './types'

describe('PANEL_IDS', () => {
  it('has expected panel IDs', () => {
    expect(PANEL_IDS.SIDEBAR).toBe('sidebar')
    expect(PANEL_IDS.EXPLORER).toBe('explorer')
    expect(PANEL_IDS.FILE_VIEWER).toBe('fileViewer')
    expect(PANEL_IDS.AGENT).toBe('agent')
    expect(PANEL_IDS.SETTINGS).toBe('settings')
    expect(PANEL_IDS.TUTORIAL).toBe('tutorial')
  })

  it('has 6 panel IDs', () => {
    expect(Object.keys(PANEL_IDS)).toHaveLength(6)
  })
})

describe('DEFAULT_TOOLBAR_PANELS', () => {
  it('contains all panel IDs', () => {
    expect(DEFAULT_TOOLBAR_PANELS).toEqual([
      'sidebar',
      'explorer',
      'fileViewer',
      'agent',
      'tutorial',
      'settings',
    ])
  })
})

describe('MAX_SHORTCUT_PANELS', () => {
  it('equals 5', () => {
    expect(MAX_SHORTCUT_PANELS).toBe(5)
  })
})
