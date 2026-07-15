import { describe, it, expect } from 'vitest'
import {
  classifyShellKind,
  posixQuote,
  fishQuote,
  powershellQuote,
  cmdQuote,
  quoteForShell,
} from './shellQuote'

describe('classifyShellKind', () => {
  it('classifies posix shells', () => {
    expect(classifyShellKind('/bin/sh')).toBe('posix')
    expect(classifyShellKind('/bin/bash')).toBe('posix')
    expect(classifyShellKind('/bin/zsh')).toBe('posix')
    expect(classifyShellKind('/usr/bin/dash')).toBe('posix')
  })

  it('classifies fish', () => {
    expect(classifyShellKind('/usr/local/bin/fish')).toBe('fish')
    expect(classifyShellKind('/opt/homebrew/bin/fish')).toBe('fish')
  })

  it('classifies PowerShell (pwsh and legacy) regardless of .exe', () => {
    expect(classifyShellKind('pwsh')).toBe('powershell')
    expect(classifyShellKind('pwsh.exe')).toBe('powershell')
    expect(classifyShellKind('powershell.exe')).toBe('powershell')
    expect(classifyShellKind('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')).toBe('powershell')
  })

  it('classifies cmd', () => {
    expect(classifyShellKind('cmd')).toBe('cmd')
    expect(classifyShellKind('cmd.exe')).toBe('cmd')
    expect(classifyShellKind('C:\\Windows\\System32\\cmd.exe')).toBe('cmd')
  })

  it('classifies git-bash and wsl as posix', () => {
    expect(classifyShellKind('C:\\Program Files\\Git\\bin\\bash.exe')).toBe('posix')
    expect(classifyShellKind('wsl.exe')).toBe('posix')
  })

  it('handles mixed separators and casing via basename', () => {
    expect(classifyShellKind('C:/Program Files/Git/bin/BASH.EXE')).toBe('posix')
    expect(classifyShellKind('')).toBe('posix')
  })
})

describe('posixQuote', () => {
  it('leaves conservative paths unquoted', () => {
    expect(posixQuote('/usr/local/bin/claude')).toBe('/usr/local/bin/claude')
    expect(posixQuote('/a/b-c_d.txt')).toBe('/a/b-c_d.txt')
  })

  it('single-quotes paths with spaces', () => {
    expect(posixQuote('/a/b c.txt')).toBe("'/a/b c.txt'")
  })

  it('escapes embedded single quotes', () => {
    expect(posixQuote("/a/it's.txt")).toBe("'/a/it'\\''s.txt'")
  })
})

describe('fishQuote', () => {
  it('always wraps and escapes backslash then quote', () => {
    expect(fishQuote('/a/b c.txt')).toBe("'/a/b c.txt'")
    expect(fishQuote('/a/b\\c')).toBe("'/a/b\\\\c'")
    expect(fishQuote("/a/it's")).toBe("'/a/it\\'s'")
  })
})

describe('powershellQuote', () => {
  it('doubles ASCII single quotes', () => {
    expect(powershellQuote('/a/b c.txt')).toBe("'/a/b c.txt'")
    expect(powershellQuote("/a/it's.txt")).toBe("'/a/it''s.txt'")
  })

  it('doubles curly single quotes PowerShell also treats as delimiters', () => {
    expect(powershellQuote('/a/it’s.txt')).toBe("'/a/it’’s.txt'")
    expect(powershellQuote('/a/‘x’.txt')).toBe("'/a/‘‘x’’.txt'")
  })

  it('doubles the low/high single-quote variants (U+201A, U+201B) too', () => {
    // A breakout attempt using ‛ (U+201B) must be neutralised by doubling.
    expect(powershellQuote('/a/x‚y.txt')).toBe("'/a/x‚‚y.txt'")
    expect(powershellQuote('x‛;calc‛')).toBe("'x‛‛;calc‛‛'")
  })
})

describe('cmdQuote', () => {
  it('always wraps in double quotes so metacharacters are inert', () => {
    expect(cmdQuote('C:\\a\\b c.txt')).toBe('"C:\\a\\b c.txt"')
    expect(cmdQuote('C:\\a\\b^&c.txt')).toBe('"C:\\a\\b^&c.txt"')
  })

  it('rejects paths with % or ! (they expand even inside quotes)', () => {
    expect(cmdQuote('C:\\a\\%TEMP%.txt')).toBeNull()
    expect(cmdQuote('C:\\a\\b!x.txt')).toBeNull()
  })
})

describe('quoteForShell', () => {
  it('dispatches to the right quoter', () => {
    expect(quoteForShell('/a/b c', 'posix')).toBe("'/a/b c'")
    expect(quoteForShell('/a/b c', 'fish')).toBe("'/a/b c'")
    expect(quoteForShell('/a/b c', 'powershell')).toBe("'/a/b c'")
    expect(quoteForShell('C:\\a\\b c', 'cmd')).toBe('"C:\\a\\b c"')
  })

  it('returns null only for an unencodable cmd path', () => {
    expect(quoteForShell('C:\\%x%', 'cmd')).toBeNull()
    expect(quoteForShell('/a/%x%', 'posix')).not.toBeNull()
  })
})
