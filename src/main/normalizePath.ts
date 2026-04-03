/** Normalize Windows backslashes to forward slashes. No-op on Unix paths. */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/')
}
