import { parseTemplate } from './templateParser'

export interface SubContext {
  main: string
  branch: string
  directory: string
  issueNumber: string
}

export interface ArgValue {
  value: string
  /** Only meaningful for optional flag-group args; required args ignore this. */
  enabled?: boolean
}

export interface SubInput {
  context: SubContext
  args: Record<string, ArgValue>
}

export function substituteTemplate(template: string, input: SubInput): string {
  const parsed = parseTemplate(template)
  let s = template

  // Strip optional flag-groups whose arg is disabled.
  for (const arg of parsed.args) {
    if (!arg.optional || !arg.flag) continue
    const val = input.args[arg.name]
    const enabled = val.enabled ?? false
    if (!enabled) {
      // Remove the leading whitespace + flag + whitespace + {name} portion.
      const escapedFlag = arg.flag.replace(/[-]/g, '\\-')
      const re = new RegExp(`(\\s+)?${escapedFlag}\\s+\\{${arg.name}\\}`, 'g')
      s = s.replace(re, '')
    }
  }

  // Substitute reserved context vars.
  s = s
    .replace(/\{main\}/g, input.context.main)
    .replace(/\{branch\}/g, input.context.branch)
    .replace(/\{directory\}/g, input.context.directory)
    .replace(/\{issueNumber\}/g, input.context.issueNumber)

  // Substitute user args (cast to allow lookup to be undefined at runtime).
  const argsMap = input.args as Record<string, ArgValue | undefined>
  s = s.replace(/\{([A-Za-z_][\w]*)\}/g, (full, name: string) => {
    const v = argsMap[name]
    return v !== undefined ? v.value : full
  })

  return s
}
