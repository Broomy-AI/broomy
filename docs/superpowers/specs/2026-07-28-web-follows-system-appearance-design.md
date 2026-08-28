# Web content follows the OS, not the Broomy theme

Broomy stops overriding `nativeTheme.themeSource`. Web pages shown in the webview
render exactly as they would in any other browser on the user's machine, while
Broomy's own UI keeps whatever theme the user picked.

## The problem

Choosing a dark Broomy theme also turns every website dark. Some users want a dark
Broomy and light web pages, and today there is no way to have both.

This is not a feature anyone built. `nativeTheme.themeSource` was introduced by
e67d538 ("feat(settings): persist appearance globally and apply it before first
paint") to make the native chrome follow the app theme — traffic lights, native
menus, file dialogs, none of which can read a CSS variable. But `themeSource` is
process-global and also drives `prefers-color-scheme` for every web content in the
process, including `<webview>` guests. Dark websites are a side effect of that one
assignment. Before e67d538, `themeSource` appears nowhere in the codebase and web
content followed the OS.

## The change

Delete both assignments and leave `themeSource` at its Electron default of
`'system'`:

- `src/main/index.ts:486-488` — the startup assignment
- `src/main/handlers/settings.ts:86` — the re-assignment on settings save

Each site keeps a comment stating that this is deliberate, so the override is not
reinstated as a "fix" later.

No new setting and no settings UI. The theme picker keeps its current meaning; web
content is simply no longer part of what it controls.

## Why this does not lighten Broomy's UI

Broomy's own interface is painted entirely from CSS variables driven by a
`data-theme` attribute. It never consults `prefers-color-scheme` — `theme.css.test.ts:62`
asserts that our stylesheets contain no such media query, because it would repaint
every Storybook story. So `themeSource` contributes nothing to the app's appearance.

The window frame also keeps following the theme: `applyChromeToAllWindows` pushes
`backgroundColor` and the Windows `titleBarOverlay` explicitly from the palette,
independent of `themeSource`.

## What does change

These native surfaces follow the OS appearance instead of the Broomy theme:

- macOS traffic-light glyphs and the app menu bar
- native file dialogs
- the webview right-click menu built in `webviewMenu.ts`

This is the trade, and it is the behaviour the app shipped with before e67d538. The
alternative — keeping `themeSource` and overriding `prefers-color-scheme` per guest
via `webContents.debugger` and CDP `Emulation.setEmulatedMedia` — buys correct
native menus at the cost of a debugger attachment per guest, a live registry of
guest contents, and re-apply plumbing. Not worth it for a context menu.

## Secondary fix: the `System` theme option

With `themeSource` forced, `nativeTheme.shouldUseDarkColors` reports the forced
value rather than the OS appearance. The `nativeTheme.on('updated')` listener in
`src/main/handlers/settings.ts:94` writes that value into `systemIsDark`, which
`resolveTheme` then uses to resolve the `system` preference.

Expected consequence today: on a light OS, switching from Dark to System leaves the
app dark, because `systemIsDark` has been poisoned with the forced `true`. Removing
the override means `shouldUseDarkColors` always reflects the real OS state.

This is stated as an expectation, not a verified claim. The test below pins down the
resulting behaviour either way.

## Testing

- A guard test asserting that `src/main` never assigns `nativeTheme.themeSource`,
  mirroring the existing `prefers-color-scheme` guard in `theme.css.test.ts`. The
  comments explain the intent; the test enforces it.
- A test that `systemIsDark` tracks the OS value reported by the `updated` listener,
  and that `resolveTheme('system', …)` follows it.

## Verification

1. `/validate` — lint, typecheck, check:all, unit tests, coverage, E2E
2. `/feature-doc` — screenshot walkthrough
3. `/code-review` on the changed files
