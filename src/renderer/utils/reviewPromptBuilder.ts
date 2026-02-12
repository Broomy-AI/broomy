import type { Session } from '../store/sessions'
import type { RequestedChange } from '../types/review'

// Build the review generation prompt
export function buildReviewPrompt(session: Session, reviewInstructions: string, previousRequestedChanges: RequestedChange[]): string {
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
  ]
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
