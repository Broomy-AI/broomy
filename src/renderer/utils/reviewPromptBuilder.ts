import type { Session } from '../store/sessions'
import type { RequestedChange } from '../types/review'

export interface PrComment {
  body: string
  path?: string
  line?: number
  author: string
}

// Build the review generation prompt
export function buildReviewPrompt(
  session: Session,
  reviewInstructions: string,
  previousRequestedChanges: RequestedChange[],
  previousHeadCommit?: string,
  prComments?: PrComment[],
): string {
  const hasPreviousReview = previousRequestedChanges.length > 0 || !!previousHeadCommit

  const changesSinceLastReviewSchema = `  "changesSinceLastReview": {
    "summary": "<1-3 sentence overview of what changed since the last review>",
    "responsesToComments": [
      {
        "comment": "<summary of the reviewer's comment>",
        "response": "<what was done to address it, or 'Not addressed'>"
      }
    ],
    "otherNotableChanges": [
      "<description of other significant changes not related to review comments>"
    ]
  }`

  const schema = `{
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

  const comparisonSchema = `{
  "newCommitsSince": ["<commit SHA 1>", "<commit SHA 2>"],
  "newFileChanges": [
    { "file": "<path>", "changeType": "added|modified|deleted" }
  ],
  "requestedChangeStatus": [
    {
      "change": { "id": "<id from previous review>", "description": "<the requested change>" },
      "status": "addressed|not-addressed|partially-addressed",
      "notes": "<optional explanation>"
    }
  ]
}`

  const baseBranch = session.prBaseBranch || 'main'

  let prompt = `# PR Review Analysis

You are reviewing a pull request. Analyze the diff and produce a structured review.

## Instructions

1. Run \`git diff origin/${baseBranch}...HEAD\` to see the full diff
2. Run \`git rev-parse HEAD\` to get the current commit SHA (for the headCommit field)
3. Examine the changed files to understand the context
4. Produce a structured JSON review and write it to \`.broomy/review.json\`

## Output Format

Write the following JSON to \`.broomy/review.json\`:

\`\`\`json
${schema}
\`\`\`

## Guidelines

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

  // Add previous review comparison instructions if there are previous changes
  if (previousRequestedChanges.length > 0) {
    prompt += `
## Previous Review Changes

In a previous review, the following changes were requested. Please evaluate whether each has been addressed:

${previousRequestedChanges.map((c, i) => `${i + 1}. ${c.description}${c.file ? ` (${c.file}${c.line ? `:${c.line}` : ''})` : ''}`).join('\n')}

After writing \`.broomy/review.json\`, also write a comparison to \`.broomy/comparison.json\`:

\`\`\`json
${comparisonSchema}
\`\`\`

To find commits since the last review, check \`.broomy/review-history.json\` for the previous headCommit and run:
\`git log <previous-commit>..HEAD --format="%H"\`
`
  }

  // Add changes-since-last-review section when we have a previous review
  if (hasPreviousReview) {
    prompt += `
## Changes Since Last Review

This is a re-review. The previous review was at commit \`${previousHeadCommit || 'unknown'}\`.

Populate the \`changesSinceLastReview\` field in your review JSON. To do this:
${previousHeadCommit ? `\n1. Run \`git log ${previousHeadCommit}..HEAD --oneline\` to see what commits were added since the last review` : ''}
${previousHeadCommit ? `2. Run \`git diff ${previousHeadCommit}..HEAD --stat\` to see what files changed` : ''}
${previousHeadCommit ? '3. ' : '1. '}Pay particular attention to what was done in response to the reviewer's comments below
${previousHeadCommit ? '4. ' : '2. '}Note any other significant changes not related to review feedback
`

    if (prComments && prComments.length > 0) {
      prompt += `
### Reviewer Comments on This PR

The following comments were left by reviewers. Assess whether each has been addressed:

${prComments.map((c, i) => `${i + 1}. ${c.author}: "${c.body}"${c.path ? ` (${c.path}${c.line ? `:${c.line}` : ''})` : ''}`).join('\n')}
`
    }
  }

  if (reviewInstructions) {
    prompt += `
## Additional Review Focus

${reviewInstructions}
`
  }

  prompt += `
## Action

Please analyze the PR now and write the result to \`.broomy/review.json\`.
`

  return prompt
}
