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

  // Context data written to .broomy/output/context.json before execution
  context?: Record<string, string>

  // Write a generated prompt file before execution
  writePrompt?: {
    file: string
    builder: string
  }

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
}

export function resolveTemplateVars(text: string, vars: TemplateVars): string {
  return text
    .replace(/\{main\}/g, vars.main)
    .replace(/\{branch\}/g, vars.branch)
    .replace(/\{directory\}/g, vars.directory)
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
        prompt: 'Read and follow the instructions in `.broomy/output/merge-prompt.md`.',
        showWhen: ['conflicts'],
        style: 'danger',
        writePrompt: { file: '.broomy/output/merge-prompt.md', builder: 'resolve-conflicts' },
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
        prompt: 'Read and follow the instructions in `.broomy/output/create-pr-prompt.md`.',
        showWhen: ['clean', 'pushed', 'no-pr'],
        style: 'primary',
        writePrompt: { file: '.broomy/output/create-pr-prompt.md', builder: 'create-pr' },
        agents: { claude: { skill: 'broomy-action-create-pr' } },
      },
      {
        id: 'push-to-main',
        label: 'Push to {main}',
        type: 'agent',
        prompt: 'Read `.broomy/output/context.json` for the target branch name. Push this branch to the target branch safely: pull the latest from the target branch and merge, run validation checks, push to remote, then run `git push origin HEAD:<target-branch>`. Do NOT ask for permission before pushing.',
        showWhen: ['clean', 'pushed', 'no-pr', 'has-write-access', 'allow-push-to-main'],
        style: 'secondary',
        context: { targetBranch: '{main}' },
        agents: { claude: { skill: 'broomy-action-push-to-main' } },
      },
      {
        id: 'review',
        label: 'Get AI Review',
        type: 'agent',
        prompt: 'Read and follow the instructions in `.broomy/output/review-prompt.md`. Write your review to `.broomy/output/review.md` as a markdown document.',
        showWhen: ['clean', 'pushed|open'],
        style: 'accent',
        writePrompt: { file: '.broomy/output/review-prompt.md', builder: 'review' },
        agents: { claude: { skill: 'broomy-action-review' } },
        switchTab: 'review',
      },
      {
        id: 'plan-issue',
        label: 'Plan Issue',
        type: 'agent',
        prompt: 'Read `.broomy/output/context.json` for the issue number. Read the issue using `gh issue view <issue-number>`. Before doing anything, ask me any questions about the issue to clarify requirements and resolve ambiguities. Then write a plan to .broomy/output/plan.md.',
        showWhen: ['has-issue'],
        style: 'secondary',
        context: { issueNumber: '{issueNumber}' },
        agents: { claude: { skill: 'broomy-action-plan-issue' } },
      },
      {
        id: 'create-devcontainer',
        label: 'Create Dev Container Config',
        type: 'agent',
        promptFile: '.broomy/prompts/create-devcontainer.md',
        showWhen: ['no-devcontainer'],
        style: 'accent',
      },
    ],
  }
}

// --- Default prompt files ---

export function getDefaultPromptFiles(): Record<string, string> {
  return {
    'commit.md': `# Broomy: Commit

Look at the current git diff and make a commit. Stage all relevant files, write a clear commit message that describes what changed and why, and commit. Do not commit any files that contain secrets or credentials.
`,
    'push-to-main.md': `# Broomy: Push to Main

Read \`.broomy/output/context.json\` for the target branch name.

Push this branch to the target branch safely. Follow these steps in order:
1. Pull the latest from the target branch and merge it into this branch, resolving any merge conflicts
2. Run the project's validation checks to make sure everything still passes, and fix any failures
3. Push this branch to its remote tracking branch
4. If the push fails, resolve the error and retry
5. Once the branch is pushed, run: \`git push origin HEAD:<target-branch>\`

IMPORTANT: Do NOT ask for permission or confirmation before running the push command. This command is safe — it will fail if there are remote commits we don't have locally. The user has explicitly requested this action, so execute it without prompting.
`,
    'create-pr.md': `# Broomy: Create PR

Read and follow the instructions in \`.broomy/output/create-pr-prompt.md\`.
`,
    'resolve-conflicts.md': `# Broomy: Resolve Conflicts

Read and follow the instructions in \`.broomy/output/merge-prompt.md\`.
`,
    'review.md': `# Broomy: Review

Read and follow the instructions in \`.broomy/output/review-prompt.md\`.
`,
    'plan-issue.md': `# Broomy: Plan Issue

Read \`.broomy/output/context.json\` for the issue number.

Read the issue using \`gh issue view <issue-number>\`. Before doing anything, ask me any questions about the issue to clarify requirements and resolve ambiguities. Then write a plan to .broomy/output/plan.md that includes: a detailed description of what you will do, and any open questions or assumptions.
`,
    'create-devcontainer.md': `# Broomy: Create Dev Container Config

Analyze this repository and create a \`.devcontainer/devcontainer.json\` file that is appropriate for the project's technology stack.

1. Look at the project's package.json, Gemfile, requirements.txt, go.mod, Cargo.toml, or other dependency files to determine the language and framework
2. Choose an appropriate base image from the Microsoft devcontainers registry (e.g. \`mcr.microsoft.com/devcontainers/typescript-node\`, \`mcr.microsoft.com/devcontainers/python\`, etc.)
3. Add relevant dev container features for the tools the project needs (git, GitHub CLI, Docker-in-Docker if needed, etc.)
4. If the project has specific system dependencies, add a \`postCreateCommand\` to install them
5. Create the \`.devcontainer/devcontainer.json\` file

Keep the configuration minimal — only include what the project actually needs.
`,
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
