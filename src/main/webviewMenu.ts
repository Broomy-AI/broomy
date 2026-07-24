/**
 * Impure wiring for the <webview> right-click menu: maps the pure item list from
 * webviewContextMenu.ts onto the guest webContents and pops up a native Menu.
 *
 * Kept apart from the builder (which stays electron-free and unit-tested) so this
 * file can import Menu/clipboard/shell without dragging the electron runtime into
 * the builder's tests.
 */
import { Menu, clipboard, shell, type WebContents, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { buildWebviewMenuItems } from './webviewContextMenu'

export function showWebviewContextMenu(
  webContents: WebContents,
  window: BrowserWindow,
  params: Electron.ContextMenuParams,
): void {
  const items = buildWebviewMenuItems(
    {
      isEditable: params.isEditable,
      editFlags: params.editFlags,
      selectionText: params.selectionText,
      linkURL: params.linkURL,
    },
    { canGoBack: webContents.canGoBack(), canGoForward: webContents.canGoForward() },
  )

  const template: MenuItemConstructorOptions[] = items.map((item) => {
    if (item.type === 'separator') return { type: 'separator' }
    return {
      label: item.label,
      enabled: item.enabled,
      click: () => {
        switch (item.action) {
          case 'cut': return webContents.cut()
          case 'copy': return webContents.copy()
          case 'paste': return webContents.paste()
          case 'selectAll': return webContents.selectAll()
          case 'copyLink': if (item.url) clipboard.writeText(item.url); return
          case 'openLink': if (item.url) void shell.openExternal(item.url); return
          case 'back': if (webContents.canGoBack()) webContents.goBack(); return
          case 'forward': if (webContents.canGoForward()) webContents.goForward(); return
          case 'reload': return webContents.reload()
        }
      },
    }
  })

  Menu.buildFromTemplate(template).popup({ window })
}
