/**
 * Commands configuration system for modular source control actions.
 *
 * Loads action definitions from `.broomy/commands.json` in the repo directory.
 * Each action defines when it appears (showWhen conditions), how it executes
 * (shell command or agent prompt), and visual style.
 */

// --- Types ---

export interface ActionDefinition {
  id: string
  label: string
  type: 'agent' | 'shell'

  // For type: "agent" — one of prompt or promptFile
  prompt?: string
  promptFile?: string

  // For type: "shell"
  command?: string

  // Conditions for showing this action (ALL must be true)
  showWhen: string[]

  // Visual style
  style?: 'primary' | 'secondary' | 'accent' | 'danger'

  // Agent-specific overrides keyed by agent type
  agents?: Record<string, AgentOverride>

  // Switch to a different explorer tab after executing (e.g. "review")
  switchTab?: string
}

export interface AgentOverride {
  skill?: string
  prompt?: string
  promptFile?: string
}

export interface CommandsConfig {
  version: number
  actions: ActionDefinition[]
}

// --- Template variables ---

export interface TemplateVars {
  main: string
  branch: string
  directory: string
  issueNumber?: string
}

export function resolveTemplateVars(text: string, vars: TemplateVars): string {
  return text
    .replace(/\{main\}/g, vars.main)
    .replace(/\{branch\}/g, vars.branch)
    .replace(/\{directory\}/g, vars.directory)
    .replace(/\{issueNumber\}/g, vars.issueNumber ?? '')
}

// --- Condition evaluation ---

export interface ConditionState {
  'has-changes': boolean
  'clean': boolean
  'merging': boolean
  'conflicts': boolean
  'no-tracking': boolean
  'ahead': boolean
  'behind': boolean
  'behind-main': boolean
  'on-main': boolean
  'in-progress': boolean
  'pushed': boolean
  'empty': boolean
  'open': boolean
  'merged': boolean
  'closed': boolean
  'no-pr': boolean
  'has-write-access': boolean
  'allow-push-to-main': boolean
  'has-issue': boolean
  'no-devcontainer': boolean
  'review': boolean
}

/**
 * Evaluate a single condition token against state.
 * Supports negation (!) and OR (|) within a token.
 */
function evaluateToken(token: string, state: ConditionState): boolean {
  // Handle negation
  if (token.startsWith('!')) {
    return !evaluateToken(token.slice(1), state)
  }

  // Handle OR within a token
  if (token.includes('|')) {
    return token.split('|').some(part => evaluateToken(part.trim(), state))
  }

  return state[token as keyof ConditionState]
}

/**
 * Evaluate showWhen conditions (ALL must be true).
 */
export function evaluateShowWhen(conditions: string[], state: ConditionState): boolean {
  if (conditions.length === 0) return true
  return conditions.every(token => evaluateToken(token, state))
}

// --- Loading ---

export function commandsConfigPath(directory: string): string {
  return `${directory}/.broomy/commands.json`
}

export async function loadCommandsConfig(directory: string): Promise<CommandsConfig | null> {
  try {
    const path = commandsConfigPath(directory)
    const exists = await window.fs.exists(path)
    if (!exists) return null

    const content = await window.fs.readFile(path)
    const config = JSON.parse(content) as CommandsConfig
    if (!config.version || !Array.isArray(config.actions)) return null
    return config
  } catch {
    return null
  }
}

// --- Agent type detection ---

export function detectAgentType(command: string): string | null {
  const base = command.trim().split(/\s+/)[0]
  const name = base.includes('/') ? base.split('/').pop()! : base

  if (name === 'claude') return 'claude'
  if (name === 'aider') return 'aider'
  if (name === 'cursor') return 'cursor'
  return null
}

// --- Default config ---

export function getDefaultCommandsConfig(): CommandsConfig {
  return {
    version: 1,
    actions: [
      {
        id: 'commit-ai',
        label: 'Commit with AI',
        type: 'agent',
        prompt: 'Look at the current git diff and make a commit. Stage all relevant files, write a clear commit message that describes what changed and why, and commit. Do not commit any files that contain secrets or credentials.',
        showWhen: ['has-changes', '!merging'],
        style: 'primary',
        agents: { claude: { skill: 'broomy-action-commit' } },
      },
      {
        id: 'resolve-conflicts',
        label: 'Resolve Conflicts',
        type: 'agent',
        prompt: 'Resolve merge conflicts from merging {main} into the current branch.\n\n1. Run `git status` to see conflicted files\n2. For each conflict, examine the markers and run `git log --oneline HEAD...MERGE_HEAD -- <file>` to understand both sides\n3. If any conflict is ambiguous, ask the user before guessing\n4. Edit files to produce correct merged results — integrate both changes where appropriate\n5. Run the project\'s lint/typecheck/test commands to verify everything passes\n6. Stage resolved files and commit with `git commit --no-edit`\n\nNever silently discard changes from either side.',
        showWhen: ['conflicts'],
        style: 'danger',
        agents: { claude: { skill: 'broomy-action-resolve-conflicts' } },
      },
      {
        id: 'sync',
        label: 'Sync Changes',
        type: 'shell',
        command: 'git pull && git push',
        showWhen: ['clean', '!no-tracking', 'ahead|behind'],
        style: 'primary',
      },
      {
        id: 'push-branch',
        label: 'Push Branch to Remote',
        type: 'shell',
        command: 'git push -u origin HEAD',
        showWhen: ['clean', 'no-tracking', '!on-main'],
        style: 'primary',
      },
      {
        id: 'sync-main',
        label: 'Get latest from {main}',
        type: 'shell',
        command: 'git fetch origin {main} && git merge origin/{main}',
        showWhen: ['clean', 'behind-main'],
        style: 'secondary',
      },
      {
        id: 'create-pr',
        label: 'Create PR',
        type: 'agent',
        prompt: 'Create a pull request for the current branch against {main}.\n\n1. Run `git diff origin/{main}...HEAD` and `git log origin/{main}..HEAD --oneline` to understand the changes\n2. Check for a PR template in `.github/PULL_REQUEST_TEMPLATE.md` or similar locations\n3. If a template exists, follow it. Otherwise write: Background and Motivation, Design Decisions, Proposed Changes (grouped by pattern, not just file lists), and Testing\n4. Derive a clear title under 70 characters. Check `gh pr list --state merged --limit 5` for style conventions\n5. Create the PR with `gh pr create --title "<title>" --body "<body>"`\n6. Write the result to `.broomy/output/pr-result.json` as `{"url": "...", "number": N, "title": "..."}`',
        showWhen: ['clean', 'pushed', 'no-pr'],
        style: 'primary',
        agents: { claude: { skill: 'broomy-action-create-pr' } },
      },
      {
        id: 'push-to-main',
        label: 'Push to {main}',
        type: 'agent',
        prompt: 'Push this branch to {main} safely.\n\n1. Pull the latest from {main} and merge it into this branch, resolving any merge conflicts\n2. Run the project\'s validation checks to make sure everything still passes, and fix any failures\n3. Push this branch to its remote tracking branch\n4. If the push fails, resolve the error and retry\n5. Once the branch is pushed, run: `git push origin HEAD:{main}`\n\nDo NOT ask for permission before running the push command. It will fail safely if there are remote commits we don\'t have locally.',
        showWhen: ['clean', 'pushed', 'no-pr', 'has-write-access', 'allow-push-to-main'],
        style: 'secondary',
        agents: { claude: { skill: 'broomy-action-push-to-main' } },
      },
      {
        id: 'review',
        label: 'Get AI Review',
        type: 'agent',
        prompt: 'Review the changes on the current branch against {main}.\n\n1. Run `git diff origin/{main}...HEAD` to see all changes\n2. Run `git log origin/{main}..HEAD --oneline` for commit history\n3. Review the code for: correctness, potential bugs, security issues, performance concerns, and code quality\n4. Write your review to `.broomy/output/review.md` as a markdown document with sections for Summary, Issues Found, Suggestions, and Overall Assessment',
        showWhen: ['clean', 'pushed|open'],
        style: 'accent',
        agents: { claude: { skill: 'broomy-action-review' } },
        switchTab: 'review',
      },
      {
        id: 'plan-issue',
        label: 'Plan Issue',
        type: 'agent',
        prompt: 'Read the issue using `gh issue view {issueNumber}`. Before doing anything, ask me any questions about the issue to clarify requirements and resolve ambiguities. Then write a plan to `.broomy/output/plan.md`.',
        showWhen: ['has-issue'],
        style: 'secondary',
        agents: { claude: { skill: 'broomy-action-plan-issue' } },
      },
      {
        id: 'create-devcontainer',
        label: 'Create Dev Container Config',
        type: 'agent',
        prompt: 'Analyze this repository and create a `.devcontainer/devcontainer.json` file appropriate for the project\'s technology stack.\n\n1. Look at dependency files (package.json, Gemfile, requirements.txt, go.mod, Cargo.toml, etc.) to determine the language and framework\n2. Choose an appropriate base image from the Microsoft devcontainers registry\n3. Add relevant dev container features for the tools the project needs\n4. If the project has specific system dependencies, add a `postCreateCommand` to install them\n5. Create the `.devcontainer/devcontainer.json` file\n\nKeep the configuration minimal — only include what the project actually needs.',
        showWhen: ['no-devcontainer'],
        style: 'accent',
      },
    ],
  }
}


// --- Ensure .broomy/.gitignore exists ---

export async function ensureOutputGitignore(directory: string): Promise<void> {
  const broomyDir = `${directory}/.broomy`
  const gitignorePath = `${broomyDir}/.gitignore`

  await window.fs.mkdir(broomyDir)

  try {
    // If .broomy/ itself is in the repo's .gitignore, output is already ignored
    const repoGitignorePath = `${directory}/.gitignore`
    const repoGitignoreExists = await window.fs.exists(repoGitignorePath)
    if (repoGitignoreExists) {
      const repoContent = await window.fs.readFile(repoGitignorePath)
      const repoLines = repoContent.split(/\r?\n/).map((l: string) => l.trim())
      if (repoLines.some((l: string) => l === '.broomy' || l === '.broomy/' || l === '/.broomy' || l === '/.broomy/')) {
        return
      }
    }

    const exists = await window.fs.exists(gitignorePath)
    if (exists) {
      const content = await window.fs.readFile(gitignorePath)
      const lines = content.split(/\r?\n/).map((l: string) => l.trim())
      if (!lines.some((l: string) => l === 'output' || l === 'output/' || l === '/output' || l === '/output/')) {
        await window.fs.appendFile(gitignorePath, '\n/output/\n')
      }
    } else {
      await window.fs.writeFile(gitignorePath, '# Broomy generated files\n/output/\n')
    }
  } catch {
    // Best effort
  }
}
