/**
 * Builds the agent prompt for generating structured code reviews with requested changes.
 */
import type { Session } from '../store/sessions'
import type { RequestedChange } from '../types/review'

export interface PrComment {
  body: string
  path?: string
  line?: number
  author: string
}

export interface ReviewPromptOptions {
  previousHeadCommit?: string
  prComments?: PrComment[]
  prDescription?: string
  currentUser?: string
}

function buildSchema(session: Session, hasPreviousReview: boolean): string {
  const changesSinceLastReviewSchema = `  "changesSinceLastReview": {
    "summary": "<1-3 sentence overview of what changed since the last review>",
    "responsesToComments": [
      {
        "comment": "<summary of the reviewer's comment>",
        "response": "<what was done to address it, or 'Not addressed'>",
        "status": "addressed|not-addressed|partially-addressed"
      }
    ],
    "changePatterns": [
      {
        "id": "<unique id>",
        "title": "<pattern name>",
        "description": "<what this group of changes does>",
        "locations": [{ "file": "<relative path>", "startLine": <number>, "endLine": <number> }]
      }
    ]
  }`

  return `{
  "version": 1,
  "generatedAt": "<ISO 8601 timestamp>",
  "prNumber": ${session.prNumber || 'null'},
  "prTitle": ${session.prTitle ? JSON.stringify(session.prTitle) : 'null'},
  "headCommit": "<current HEAD commit SHA>",
  "overview": {
    "purpose": "<1-2 sentence summary of what this PR does>",
    "approach": "<1-2 sentence summary of how it achieves it>"
  },
  "changePatterns": [
    {
      "id": "<unique id>",
      "title": "<pattern name>",
      "description": "<what this group of changes does>",
      "locations": [{ "file": "<relative path>", "startLine": <number>, "endLine": <number> }]
    }
  ],
  "potentialIssues": [
    {
      "id": "<unique id>",
      "severity": "info|warning|concern",
      "title": "<issue title>",
      "description": "<explanation>",
      "locations": [{ "file": "<relative path>", "startLine": <number>, "endLine": <number> }]
    }
  ],
  "designDecisions": [
    {
      "id": "<unique id>",
      "title": "<decision>",
      "description": "<explanation of the choice>",
      "alternatives": ["<alternative approach 1>"],
      "locations": [{ "file": "<relative path>", "startLine": <number>, "endLine": <number> }]
    }
  ],
  "requestedChanges": [
    {
      "id": "<unique id>",
      "description": "<what needs to be changed>",
      "file": "<optional: specific file>",
      "line": <optional: specific line number>
    }
  ]${hasPreviousReview ? `,\n${changesSinceLastReviewSchema}` : ''}
}`
}

function buildGuidelines(): string {
  return `## Guidelines

- **Change Patterns**: Group related changes together. Don't just list every file - identify logical groups.
- **Potential Issues**: Only flag real concerns. Use severity levels:
  - \`info\`: Observations, suggestions, style preferences
  - \`warning\`: Potential bugs, edge cases, missing error handling
  - \`concern\`: Likely bugs, security issues, data loss risks
- **Design Decisions**: Note significant architectural choices, not trivial ones.
- **Requested Changes**: List specific changes you'd like to see addressed. Be concrete and actionable.
- Keep descriptions concise but informative.
- Use relative file paths from the repo root.
- Include specific line numbers where relevant.
`
}

// Build a first-time review prompt
function buildFirstReviewPrompt(
  session: Session,
  reviewInstructions: string,
  options?: ReviewPromptOptions,
): string {
  const { prDescription } = options || {}
  const baseBranch = session.prBaseBranch || 'main'
  const schema = buildSchema(session, false)

  let prompt = `# PR Review Analysis

You are reviewing a pull request. Analyze the diff and produce a structured review.
`

  if (prDescription) {
    prompt += `
## PR Description (by the author)

${prDescription}
`
  }

  prompt += `
## Instructions

1. Run \`git diff origin/${baseBranch}...HEAD\` to see the full diff
2. Run \`git rev-parse HEAD\` to get the current commit SHA (for the headCommit field)
3. Examine the changed files to understand the context
4. Produce a structured JSON review and write it to \`.broomy/output/review.json\`

## Output Format

Write the following JSON to \`.broomy/output/review.json\`:

\`\`\`json
${schema}
\`\`\`

${buildGuidelines()}`

  if (reviewInstructions) {
    prompt += `
## Additional Review Focus

${reviewInstructions}
`
  }

  prompt += `
## Action

Please analyze the PR now and write the result to \`.broomy/output/review.json\`.
`

  return prompt
}

// Build a re-review prompt focused on changes since last review
function buildReReviewPrompt(
  session: Session,
  reviewInstructions: string,
  previousRequestedChanges: RequestedChange[],
  options: ReviewPromptOptions,
): string {
  const { previousHeadCommit, prComments, prDescription, currentUser } = options
  const baseBranch = session.prBaseBranch || 'main'
  const schema = buildSchema(session, true)

  let prompt = `# PR Re-Review

You are re-reviewing a pull request that you previously reviewed. Focus on what has changed since the last review.

The previous review was at commit \`${previousHeadCommit || 'unknown'}\`.
`

  if (prDescription) {
    prompt += `
## PR Description (by the author)

${prDescription}
`
  }

  prompt += `
## Instructions

1. Run \`git diff ${previousHeadCommit}..HEAD --stat\` to see what files changed since the last review
2. Run \`git log ${previousHeadCommit}..HEAD --oneline\` to see what commits were added
3. Run \`git diff origin/${baseBranch}...HEAD\` to see the full current diff
4. Run \`git rev-parse HEAD\` to get the current commit SHA (for the headCommit field)
5. Produce a structured JSON review and write it to \`.broomy/output/review.json\`

## Responses to Your Comments

Check whether each of the following comments/requested changes has been addressed in the new commits.
`

  // Show the reviewer's own PR comments first (filtered by currentUser)
  const userComments = currentUser && prComments
    ? prComments.filter(c => c.author === currentUser)
    : []
  const otherComments = currentUser && prComments
    ? prComments.filter(c => c.author !== currentUser)
    : prComments || []

  if (userComments.length > 0) {
    prompt += `
### Your PR Comments

${userComments.map((c, i) => `${i + 1}. "${c.body}"${c.path ? ` (${c.path}${c.line ? `:${c.line}` : ''})` : ''}`).join('\n')}
`
  }

  if (previousRequestedChanges.length > 0) {
    prompt += `
### Your Previously Requested Changes

${previousRequestedChanges.map((c, i) => `${i + 1}. ${c.description}${c.file ? ` (${c.file}${c.line ? `:${c.line}` : ''})` : ''}`).join('\n')}
`
  }

  if (otherComments.length > 0) {
    prompt += `
### Other Reviewer Comments

${otherComments.map((c, i) => `${i + 1}. ${c.author}: "${c.body}"${c.path ? ` (${c.path}${c.line ? `:${c.line}` : ''})` : ''}`).join('\n')}
`
  }

  prompt += `
For each comment or requested change, assess its status as one of: \`addressed\`, \`not-addressed\`, or \`partially-addressed\`.

## Changes Since Last Review

Populate the \`changesSinceLastReview\` field with:
- A summary of what changed
- Status of each comment/requested change (in \`responsesToComments\`)
- Structured change patterns for the diff since the last review (in \`changePatterns\`, with file locations)

## Output Format

Write the following JSON to \`.broomy/output/review.json\`:

\`\`\`json
${schema}
\`\`\`

${buildGuidelines()}`

  if (reviewInstructions) {
    prompt += `
## Additional Review Focus

${reviewInstructions}
`
  }

  prompt += `
## Action

Please analyze the changes since the last review and write the result to \`.broomy/output/review.json\`.
`

  return prompt
}

/**
 * Build a markdown-format review prompt that instructs the agent to write `.broomy/output/review.md`.
 */
export function buildMarkdownReviewPrompt(
  session: Session,
  reviewInstructions: string,
  options?: ReviewPromptOptions,
): string {
  const baseBranch = session.prBaseBranch || 'main'
  const { prDescription, previousHeadCommit } = options || {}
  const prChangesUrl = session.prUrl ? `${session.prUrl}/files` : null

  let prompt = `# PR Review

You are reviewing a pull request. Analyze the diff and produce a detailed review as a markdown document.
`

  if (prDescription) {
    prompt += `
## PR Description (by the author)

${prDescription}
`
  }

  const isReReview = !!previousHeadCommit

  prompt += `
## Instructions

1. Run \`git diff origin/${baseBranch}...HEAD\` to see the full diff
`

  if (isReReview) {
    prompt += `2. Run \`git diff ${previousHeadCommit}..HEAD --stat\` to see what changed since the last review
3. Run \`git log ${previousHeadCommit}..HEAD --oneline\` to see new commits
`
  }

  prompt += `
## Output Format

Write your review to \`.broomy/output/review.md\` as a markdown document. Follow these rules:

- Use \`## Heading\` for each major section (the UI will auto-collapse these as collapsible sections)
- Use \`### Sub-heading\` for individual issues, findings, or change groups within a section
- Use \`- [ ] Check name\` for in-progress checks and \`- [x] Check name\` for completed checks (place these under the relevant \`###\` sub-heading)
- Sections with incomplete checkboxes (\`- [ ]\`) will stay expanded in the UI
- **IMPORTANT — Links**: Every mention of a file, function, or code location MUST include a clickable link to the PR diff view. Never omit links — the reader navigates the review by clicking them. All links MUST point to the PR diff view, never to the blob/file view. ${prChangesUrl ? `Use \`${prChangesUrl}\` as the base URL and append \`#diff-<sha256-of-filepath>\` for each file.` : 'Use the PR files/changes URL (e.g. `https://github.com/owner/repo/pull/N/files#diff-<sha256-of-filepath>`) for each file.'} To compute the anchor, take the SHA-256 hash of the file's relative path. Example: for \`src/app.tsx\` → \`${prChangesUrl || 'https://github.com/owner/repo/pull/N/files'}#diff-<sha256 of "src/app.tsx">\`. You can run \`echo -n "path" | shasum -a 256\` to compute the hash.
- You can use \`<!-- include: .broomy/review-detail-name.md -->\` to break out sub-analyses into separate files — the UI will inline them when they exist
- Write the file incrementally — the UI polls and re-renders as you write

### Suggested sections

\`\`\`markdown
## Overview
Brief summary of what this PR does and the approach taken.

## Change Analysis
- [x] Reviewed file structure
- [x] Identified change patterns

### Theme context and provider
Description of this change group.
[src/file.tsx](${prChangesUrl || 'https://github.com/owner/repo/pull/N/files'}#diff-<sha256>)

### CSS variable updates
Description of this change group.
[src/styles.css](${prChangesUrl || 'https://github.com/owner/repo/pull/N/files'}#diff-<sha256>)

## Potential Issues

### Flash of unstyled content on load
- [ ] Resolved

Description of the issue and its impact.
Location: [src/file.tsx](${prChangesUrl || 'https://github.com/owner/repo/pull/N/files'}#diff-<sha256>)

## Design Decisions

### localStorage over cookies
- [x] Reviewed

Explanation of the decision and alternatives considered.
${isReReview ? `
## Changes Since Last Review
Summarize what changed since commit \`${previousHeadCommit}\`.
` : ''}
\`\`\`
`

  if (reviewInstructions) {
    prompt += `
## Additional Review Focus

${reviewInstructions}
`
  }

  prompt += `
## Action

Please analyze the PR now and write the result to \`.broomy/output/review.md\`.
`

  return prompt
}

// Build the review generation prompt — picks first-review or re-review based on context
export function buildReviewPrompt(
  session: Session,
  reviewInstructions: string,
  previousRequestedChanges: RequestedChange[],
  options?: ReviewPromptOptions,
): string {
  const { previousHeadCommit, prComments } = options || {}
  const hasPreviousReview = previousRequestedChanges.length > 0 || !!previousHeadCommit

  if (hasPreviousReview) {
    return buildReReviewPrompt(session, reviewInstructions, previousRequestedChanges, {
      ...options,
      previousHeadCommit,
      prComments,
    })
  }

  return buildFirstReviewPrompt(session, reviewInstructions, options)
}
