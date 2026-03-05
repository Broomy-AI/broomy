/**
 * Skill action definitions for Claude Code command integration.
 *
 * Each action maps to a `.claude/commands/broomy-action-<name>.md` file that
 * Claude Code can execute as a slash command. When the file exists, Broomy
 * sends `/broomy-action-<name>` instead of a hardcoded prompt.
 */

export type SkillActionName =
  | 'commit'
  | 'push-to-main'
  | 'create-pr'
  | 'resolve-conflicts'
  | 'review'
  | 'plan-issue'
  | 'review-md'

export interface SkillAction {
  name: SkillActionName
  label: string
  defaultContent: string
}

export function skillCommandPath(repoDir: string, actionName: SkillActionName): string {
  return `${repoDir}/.claude/commands/broomy-action-${actionName}.md`
}

export const SKILL_ACTIONS: SkillAction[] = [
  {
    name: 'commit',
    label: 'Commit',
    defaultContent: `# Broomy: Commit

Look at the current git diff and make a commit. Stage all relevant files, write a clear commit message that describes what changed and why, and commit. Do not commit any files that contain secrets or credentials.
`,
  },
  {
    name: 'push-to-main',
    label: 'Push to Main',
    defaultContent: `# Broomy: Push to Main

Read \`.broomy/output/context.json\` for the target branch name.

Push this branch to the target branch safely. Follow these steps in order:
1. Pull the latest from the target branch and merge it into this branch, resolving any merge conflicts
2. Run the project's validation checks to make sure everything still passes, and fix any failures
3. Push this branch to its remote tracking branch
4. If the push fails, resolve the error and retry
5. Once the branch is pushed, run: \`git push origin HEAD:<target-branch>\`
`,
  },
  {
    name: 'create-pr',
    label: 'Create PR',
    defaultContent: `# Broomy: Create PR

Read and follow the instructions in \`.broomy/output/create-pr-prompt.md\`.
`,
  },
  {
    name: 'resolve-conflicts',
    label: 'Resolve Conflicts',
    defaultContent: `# Broomy: Resolve Conflicts

Read and follow the instructions in \`.broomy/output/merge-prompt.md\`.
`,
  },
  {
    name: 'review',
    label: 'Review (Legacy)',
    defaultContent: `# Broomy: Review

Read and follow the instructions in \`.broomy/review-prompt.md\`.
`,
  },
  {
    name: 'review-md',
    label: 'Review',
    defaultContent: `# Broomy: Review

Read and follow the instructions in \`.broomy/output/review-prompt.md\`.

Write your review to \`.broomy/output/review.md\` as a markdown document. Use \`## Heading\` for major sections and \`### Sub-heading\` for individual issues or findings within each section. Use \`- [ ] Check name\` / \`- [x] Check name\` for task checkboxes under each sub-heading. Include \`[View on GitHub](url)\` links where relevant.

Write the file incrementally — the UI will poll and re-render as you write.
`,
  },
  {
    name: 'plan-issue',
    label: 'Plan Issue',
    defaultContent: `# Broomy: Plan Issue

Read \`.broomy/output/context.json\` for the issue number.

Read the issue using \`gh issue view <issue-number>\`. Before doing anything, ask me any questions about the issue to clarify requirements and resolve ambiguities. Then write a plan to .broomy/output/plan.md that includes: a detailed description of what you will do, and any open questions or assumptions.
`,
  },
]
