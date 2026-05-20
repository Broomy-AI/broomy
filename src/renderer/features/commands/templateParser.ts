export const RESERVED_CONTEXT_VARS = new Set(['main', 'branch', 'directory', 'issueNumber'])

export interface TemplateArg {
  name: string
  optional: boolean
  flag: string | null
}

export interface ParsedTemplate {
  args: TemplateArg[]
  isMultiLine: boolean
}

const FLAG_AND_PLACEHOLDER = /(?:^|\s)(--?[A-Za-z][\w-]*)\s+\{([A-Za-z_][\w]*)\}/g
const ANY_PLACEHOLDER = /\{([A-Za-z_][\w]*)\}/g

export function parseTemplate(template: string): ParsedTemplate {
  const isMultiLine = template.includes('\n')
  if (isMultiLine) return { args: [], isMultiLine }

  const flagBy = new Map<string, string>()
  let m: RegExpExecArray | null
  FLAG_AND_PLACEHOLDER.lastIndex = 0
  while ((m = FLAG_AND_PLACEHOLDER.exec(template)) !== null) {
    const [, flag, name] = m
    if (!RESERVED_CONTEXT_VARS.has(name) && !flagBy.has(name)) {
      flagBy.set(name, flag)
    }
  }

  const seen = new Set<string>()
  const args: TemplateArg[] = []
  ANY_PLACEHOLDER.lastIndex = 0
  while ((m = ANY_PLACEHOLDER.exec(template)) !== null) {
    const name = m[1]
    if (RESERVED_CONTEXT_VARS.has(name)) continue
    if (seen.has(name)) continue
    seen.add(name)
    const flag = flagBy.get(name) ?? null
    args.push({ name, optional: flag !== null, flag })
  }

  return { args, isMultiLine }
}
