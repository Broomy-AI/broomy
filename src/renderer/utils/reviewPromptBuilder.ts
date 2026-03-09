/**
 * Builds the agent prompt for generating structured code reviews with requested changes.
 */
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

function buildSchema(session: ReviewSessionInfo, hasPreviousReview: boolean): string {
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
  session: ReviewSessionInfo,
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
  session: ReviewSessionInfo,
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

export interface ReviewSessionInfo {
  prBaseBranch?: string
  prNumber?: number
  prTitle?: string
  prUrl?: string
}

/**
 * Build a markdown-format review prompt that instructs the agent to write `.broomy/output/review.md`.
 */
export function buildMarkdownReviewPrompt(
  session: ReviewSessionInfo,
  reviewInstructions: string,
  options?: ReviewPromptOptions,
): string {
  const baseBranch = session.prBaseBranch || 'main'
  const { prDescription, previousHeadCommit } = options || {}

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
- **IMPORTANT — Links**: Every mention of a file, function, or code location MUST be a markdown link using the repo-relative file path. The link text should be the file path with optional line range, and the URL should be the relative path with an optional line anchor. Format: \`[src/file.tsx:12-45](src/file.tsx#L12-L45)\` for a range, or \`[src/file.tsx:12](src/file.tsx#L12)\` for a single line. Never paste raw URLs or GitHub links — the UI renders these as clickable links that open an internal diff viewer. Never omit links — the reader navigates the review by clicking them.
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
[src/theme/ThemeProvider.tsx:15-42](src/theme/ThemeProvider.tsx#L15-L42)

### CSS variable updates
Description of this change group.
[src/styles.css:1-20](src/styles.css#L1-L20)

## Potential Issues

### Flash of unstyled content on load
- [ ] Resolved

Description of the issue and its impact.
Location: [src/file.tsx:45-52](src/file.tsx#L45-L52)

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
  session: ReviewSessionInfo,
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
