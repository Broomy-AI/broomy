/**
 * Shell-aware, injection-safe quoting for inserting file paths into a terminal.
 *
 * A path dropped onto the xterm PTY is written verbatim to whatever shell runs
 * there. Each shell *parser* needs its own literal encoding — a naïve single
 * quoter is an injection boundary on PowerShell/cmd/fish. `classifyShellKind`
 * maps a resolved shell executable to one of four parser families and
 * `quoteForShell` encodes a string as a safe literal argument for it.
 *
 * Note: this handles per-parser *quoting* only. Host→container/WSL path
 * *translation* is a separate, deferred concern (see the drop-to-terminal
 * feature doc).
 */

export type ShellKind = 'posix' | 'fish' | 'powershell' | 'cmd'

/**
 * Classify a resolved shell executable path into a parser family.
 * Normalizes separators, lowercases, and takes the basename so both
 * `C:\Program Files\Git\bin\bash.exe` and `/bin/zsh` classify correctly.
 * sh/bash/zsh/dash, git-bash and wsl all use the POSIX single-quote parser.
 */
export function classifyShellKind(shell: string): ShellKind {
  const base = shell.toLowerCase().split(/[\\/]/).pop() ?? ''
  const name = base.endsWith('.exe') ? base.slice(0, -4) : base
  if (name.startsWith('pwsh') || name.startsWith('powershell')) return 'powershell'
  if (name === 'cmd') return 'cmd'
  if (name === 'fish') return 'fish'
  return 'posix'
}

/**
 * POSIX single-quote. Byte-for-byte identical to the historical devcontainer
 * quoter (safe unquoted for a conservative character set, otherwise wrapped in
 * '…' with embedded quotes escaped as '\'').
 */
export function posixQuote(s: string): string {
  if (/^[a-zA-Z0-9_./:=@%^+,-]+$/.test(s)) return s
  return `'${s.replace(/'/g, "'\\''")}'`
}

/**
 * Fish single-quote. Inside '…' fish interprets only `\\` and `\'`, so escape
 * backslashes first, then single quotes.
 */
export function fishQuote(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

/**
 * PowerShell single-quote. Inside '…' the sole escape is a doubled quote.
 * PowerShell's tokenizer treats FIVE characters as single-quote delimiters and
 * closes the string on ANY of them: ' (U+0027) plus the low/high/curly variants
 * ‘ (U+2018), ’ (U+2019), ‚ (U+201A), ‛ (U+201B). Double every one so none of
 * them can terminate the literal — omitting any is an injection bypass.
 */
export function powershellQuote(s: string): string {
  return `'${s.replace(/['‘’‚‛]/g, (m) => m + m)}'`
}

/**
 * cmd.exe. `%…%` and `!…!` expand even inside double quotes, so there is no
 * context-free literal for a path containing `%` or `!` — such paths are
 * rejected (returns null). Every other path is *always* wrapped in "…"; an
 * unquoted `^`, `&`, etc. would otherwise be consumed/interpreted by cmd.
 * (Windows filenames cannot contain `"`, so wrapping is unambiguous.)
 */
export function cmdQuote(s: string): string | null {
  if (/[%!]/.test(s)) return null
  return `"${s}"`
}

/**
 * Encode `s` as a safe literal argument for the given shell parser.
 * Returns null when the path cannot be safely encoded (a cmd path with % or !).
 */
export function quoteForShell(s: string, kind: ShellKind): string | null {
  switch (kind) {
    case 'fish':
      return fishQuote(s)
    case 'powershell':
      return powershellQuote(s)
    case 'cmd':
      return cmdQuote(s)
    case 'posix':
    default:
      return posixQuote(s)
  }
}
