import { describe, it, expect } from 'vitest'
import { buildWebviewMenuItems, type WebviewMenuParams, type WebviewNavState } from './webviewContextMenu'

const noFlags = { canCut: false, canCopy: false, canPaste: false, canSelectAll: false }

function params(overrides: Partial<WebviewMenuParams> = {}): WebviewMenuParams {
  return { isEditable: false, editFlags: noFlags, selectionText: '', linkURL: '', ...overrides }
}

const noNav: WebviewNavState = { canGoBack: false, canGoForward: false }

const actions = (items: ReturnType<typeof buildWebviewMenuItems>) =>
  items.filter((i) => i.type !== 'separator').map((i) => (i as { action: string }).action)

describe('buildWebviewMenuItems', () => {
  it('always offers navigation controls, even on a plain page with no selection', () => {
    const items = buildWebviewMenuItems(params(), noNav)
    expect(actions(items)).toEqual(['back', 'forward', 'reload'])
  })

  it('reflects navigation availability in enabled state', () => {
    const items = buildWebviewMenuItems(params(), { canGoBack: true, canGoForward: false })
    const byAction = new Map(items.filter((i) => i.type !== 'separator').map((i) => [(i as { action: string }).action, i]))
    expect((byAction.get('back') as { enabled: boolean }).enabled).toBe(true)
    expect((byAction.get('forward') as { enabled: boolean }).enabled).toBe(false)
    expect((byAction.get('reload') as { enabled: boolean }).enabled).toBe(true)
  })

  it('offers Copy and Select All when there is a text selection', () => {
    const items = buildWebviewMenuItems(
      params({ selectionText: 'hello', editFlags: { ...noFlags, canCopy: true, canSelectAll: true } }),
      noNav,
    )
    expect(actions(items)).toEqual(['copy', 'selectAll', 'back', 'forward', 'reload'])
  })

  it('offers Cut/Copy/Paste/Select All in an editable field, gated by edit flags', () => {
    const items = buildWebviewMenuItems(
      params({ isEditable: true, editFlags: { canCut: true, canCopy: true, canPaste: false, canSelectAll: true } }),
      noNav,
    )
    expect(actions(items)).toEqual(['cut', 'copy', 'paste', 'selectAll', 'back', 'forward', 'reload'])
    const paste = items.find((i) => i.type !== 'separator' && (i as { action: string }).action === 'paste')
    expect((paste as { enabled: boolean }).enabled).toBe(false)
  })

  it('offers link actions carrying the URL when right-clicking a hyperlink', () => {
    const items = buildWebviewMenuItems(params({ linkURL: 'https://example.com/page' }), noNav)
    expect(actions(items)).toEqual(['openLink', 'copyLink', 'back', 'forward', 'reload'])
    const open = items.find((i) => i.type !== 'separator' && (i as { action: string }).action === 'openLink')
    expect((open as { url?: string }).url).toBe('https://example.com/page')
  })

  it('ignores a non-http(s) link URL (no open/copy for javascript: or file:)', () => {
    const items = buildWebviewMenuItems(params({ linkURL: 'javascript:alert(1)' }), noNav)
    expect(actions(items)).toEqual(['back', 'forward', 'reload'])
  })

  it('separates the context-specific section from the navigation section', () => {
    const items = buildWebviewMenuItems(params({ selectionText: 'x', editFlags: { ...noFlags, canCopy: true } }), noNav)
    const sepIndex = items.findIndex((i) => i.type === 'separator')
    expect(sepIndex).toBeGreaterThan(0)
    expect(sepIndex).toBeLessThan(items.length - 1)
  })
})
