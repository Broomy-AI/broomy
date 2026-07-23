/**
 * Pure validator for every URL the privileged side hands to the OS via `shell.openExternal`.
 *
 * Kept out of index.ts (importing that module boots the app) so the decision stays
 * unit-testable, and shared by every path that can reach `shell.openExternal` with a URL
 * the app did not construct itself:
 *   - the `shell:openExternal` IPC handler (renderer callers, incl. untrusted terminal output),
 *   - `setWindowOpenHandler` (a `window.open()` from anything running in the renderer).
 *
 * External URLs cross an untrusted boundary — agent terminal output, repo content, review
 * markdown — so only http(s) reaches the OS. Everything else (file:, mailto:, custom app
 * protocols, malformed input) is refused. Every in-app caller already passes http(s), so this
 * narrows the attack surface without changing behaviour.
 *
 * Requires a literal `http(s)://` prefix (rejecting `http:\\host`, whitespace-prefixed, and
 * scheme-only inputs) and returns the WHATWG-normalized form, so the OS receives exactly the
 * URL that was validated rather than a variant its own parser might read differently.
 * Embedded credentials are refused: `https://github.com@evil.example` reads as a trusted host
 * to a human skimming terminal output, which is precisely the spoof this boundary should stop.
 */
export function toHttpUrl(url: unknown): string | null {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (parsed.username || parsed.password) return null
    return parsed.href
  } catch {
    return null
  }
}
