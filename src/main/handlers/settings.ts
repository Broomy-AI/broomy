/**
 * IPC for the global appearance settings, and the owner of everything native that
 * has to follow the theme.
 *
 * The renderer can restyle itself from a CSS variable. The window frame, the
 * Windows caption buttons, the macOS traffic lights, the native file dialogs and
 * the context menus cannot — they live outside the DOM. `nativeTheme.themeSource`
 * is what makes those follow, and it is process-global, which is the main reason
 * appearance is a global setting rather than a per-profile one.
 */
import { BrowserWindow, IpcMain, nativeTheme, type MenuItemConstructorOptions } from 'electron'
import { HandlerContext } from './types'
import {
  chromeFor,
  getAppearance,
  getResolvedTheme,
  saveAppearance,
  setSystemIsDark,
  snapshot,
} from '../settings'
import { INTERFACE_SCALES, stepScale, type Appearance } from '../../shared/appearance'

const TITLE_BAR_HEIGHT = 40

/**
 * Push the theme and scale onto every window's native chrome.
 *
 * Zoom scales the renderer's CSS pixels, but native geometry is in
 * device-independent pixels and does NOT zoom — so the title-bar overlay has to be
 * re-driven, or the custom toolbar drifts out of alignment with the real caption
 * buttons.
 *
 * The window's minimum size is deliberately NOT scaled. `setMinimumSize(800*z,
 * 600*z)` would demand a 1600x1200 window at 200% — taller than a 1080p display —
 * and would forbid the very window size the acceptance test uses.
 */
export function applyChromeToAllWindows(ctx: HandlerContext): void {
  const theme = getResolvedTheme()
  const appearance = getAppearance()
  const chrome = chromeFor(theme, appearance.accent)

  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue

    win.setBackgroundColor(chrome.background)
    win.webContents.setZoomFactor(appearance.interfaceScale)

    // Windows-only, and guarded: calling this on macOS or Linux throws, and an
    // uncaught throw in main takes the whole app down.
    if (ctx.isWindows) {
      try {
        win.setTitleBarOverlay({
          color: chrome.titleBar,
          symbolColor: chrome.symbol,
          height: Math.round(TITLE_BAR_HEIGHT * appearance.interfaceScale),
        })
      } catch {
        // A window created without titleBarOverlay cannot accept one. Not fatal.
      }
    }
  }
}

function broadcast(): void {
  const snap = snapshot()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('settings:changed', snap)
  }
}

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  // Synchronous on purpose. The renderer needs the theme BEFORE it paints, and an
  // async round-trip cannot serve a value that must exist before the first frame.
  // This is the difference between opening the app and opening the app with a dark
  // flash across it.
  ipcMain.on('settings:getSync', (event) => {
    event.returnValue = snapshot()
  })

  ipcMain.handle('settings:load', () => snapshot())

  ipcMain.handle('settings:save', (_event, appearance: Appearance) => {
    const result = saveAppearance(appearance)
    // Apply even if the disk write failed: the user asked for this, and refusing to
    // show it because a file is unwritable would be worse than showing it.
    nativeTheme.themeSource = getAppearance().theme === 'system' ? 'system' : (getResolvedTheme() === 'light' || getResolvedTheme() === 'hc-light' ? 'light' : 'dark')
    applyChromeToAllWindows(ctx)
    broadcast()
    return result
  })

  // The OS appearance changed under a `system` preference. Update and broadcast —
  // but never write to disk: the user's preference has not changed, only the world.
  nativeTheme.on('updated', () => {
    setSystemIsDark(nativeTheme.shouldUseDarkColors)
    applyChromeToAllWindows(ctx)
    broadcast()
  })
}

/**
 * The View menu's zoom items.
 *
 * Electron's `zoomIn`/`zoomOut`/`resetZoom` ROLES apply a zoom that is forgotten on
 * restart — which is issue #135's complaint about them, verbatim. Replacing them
 * with handlers that write through the settings store is what makes Cmd +/- persist.
 *
 * A role also supplies its label and accelerator for free; a custom item inherits
 * neither, so both are spelled out here. `Cmd+=` is registered as a hidden item
 * because the built-in role binds it too, and on most keyboards it is what `Cmd+Plus`
 * actually requires you to press.
 */
export function zoomMenuItems(ctx: HandlerContext): MenuItemConstructorOptions[] {
  return [
    { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: () => stepInterfaceScale(ctx, 0) },
    { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', click: () => stepInterfaceScale(ctx, 1) },
    { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', visible: false, click: () => stepInterfaceScale(ctx, 1) },
    { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => stepInterfaceScale(ctx, -1) },
  ]
}

/** Nudge the interface scale, from the View menu. Keeps the menu and Settings in step. */
export function stepInterfaceScale(ctx: HandlerContext, delta: number): void {
  const current = getAppearance()
  const interfaceScale = delta === 0
    ? 1
    : stepScale(current.interfaceScale, delta, INTERFACE_SCALES)

  const result = saveAppearance({ ...current, interfaceScale })
  // Apply regardless — the user asked for this, and refusing to show it because a
  // file is unwritable would be worse. But do NOT let it fail silently: Cmd +/- is
  // now a settings edit, and a scale that quietly reverts on restart is maddening.
  // The Settings UI already surfaces this; the menu path must not be the exception.
  applyChromeToAllWindows(ctx)
  broadcast()

  if (!result.success) {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue
      win.webContents.send('settings:save-failed', result.error ?? 'Unknown error')
    }
  }
}
