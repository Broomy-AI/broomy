/**
 * Pure builder for the right-click menu shown over a <webview> guest page.
 *
 * Electron guests render NO context menu on their own — the embedder must catch
 * the guest's `context-menu` event and pop up a native Menu itself. Kept out of
 * index.ts (importing that module boots the app) so the item logic stays
 * unit-testable; index.ts maps each item's `action` onto the guest webContents.
 *
 * The menu always ends with Back / Forward / Reload; a context-specific section
 * (link actions, or edit/selection actions) is prepended and separated from it.
 */
import { toHttpUrl } from './externalUrl'

export interface WebviewMenuParams {
  isEditable: boolean
  editFlags: { canCut: boolean; canCopy: boolean; canPaste: boolean; canSelectAll: boolean }
  selectionText: string
  linkURL: string
}

export interface WebviewNavState {
  canGoBack: boolean
  canGoForward: boolean
}

export type WebviewMenuActionId =
  | 'cut'
  | 'copy'
  | 'paste'
  | 'selectAll'
  | 'copyLink'
  | 'openLink'
  | 'back'
  | 'forward'
  | 'reload'

export type WebviewMenuItem =
  | { type: 'separator' }
  | { type: 'item'; label: string; action: WebviewMenuActionId; enabled: boolean; url?: string }

export function buildWebviewMenuItems(params: WebviewMenuParams, nav: WebviewNavState): WebviewMenuItem[] {
  const contextItems: WebviewMenuItem[] = []

  // Only http(s) links are actionable — refuse javascript:/file:/data: etc.,
  // matching the shell:openExternal guard the "Open in browser" button uses.
  const safeLink = toHttpUrl(params.linkURL)
  if (safeLink) {
    contextItems.push({ type: 'item', label: 'Open Link in Browser', action: 'openLink', enabled: true, url: safeLink })
    contextItems.push({ type: 'item', label: 'Copy Link Address', action: 'copyLink', enabled: true, url: safeLink })
  }

  if (params.isEditable) {
    contextItems.push({ type: 'item', label: 'Cut', action: 'cut', enabled: params.editFlags.canCut })
    contextItems.push({ type: 'item', label: 'Copy', action: 'copy', enabled: params.editFlags.canCopy })
    contextItems.push({ type: 'item', label: 'Paste', action: 'paste', enabled: params.editFlags.canPaste })
    contextItems.push({ type: 'item', label: 'Select All', action: 'selectAll', enabled: params.editFlags.canSelectAll })
  } else if (params.selectionText) {
    contextItems.push({ type: 'item', label: 'Copy', action: 'copy', enabled: params.editFlags.canCopy })
    contextItems.push({ type: 'item', label: 'Select All', action: 'selectAll', enabled: params.editFlags.canSelectAll })
  }

  const navItems: WebviewMenuItem[] = [
    { type: 'item', label: 'Back', action: 'back', enabled: nav.canGoBack },
    { type: 'item', label: 'Forward', action: 'forward', enabled: nav.canGoForward },
    { type: 'item', label: 'Reload', action: 'reload', enabled: true },
  ]

  return contextItems.length > 0 ? [...contextItems, { type: 'separator' }, ...navItems] : navItems
}
