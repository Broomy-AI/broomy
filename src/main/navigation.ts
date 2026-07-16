/**
 * Pure predicate for the BrowserWindow `will-navigate` policy.
 *
 * Kept out of index.ts (importing that module boots the app) so the decision
 * stays unit-testable. Only a genuine same-URL reload is allowed; any *other*
 * file:// navigation is blocked — a file dropped anywhere in the window must
 * never be able to replace the renderer (data loss). Everything else
 * (http(s)/mailto/…) opens in the external browser.
 *
 * Vite HMR is unaffected: it uses websockets, not navigation events. A dev or
 * prod reload navigates to the same URL and is allowed.
 */
export type NavigationAction = 'allow' | 'external' | 'block'

export function navigationAction(currentUrl: string, url: string): NavigationAction {
  if (currentUrl && url === currentUrl) return 'allow'
  if (url.startsWith('file://')) return 'block'
  return 'external'
}
