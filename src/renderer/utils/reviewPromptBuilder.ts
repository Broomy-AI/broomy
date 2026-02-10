import type { Session } from '../store/sessions'

// Build the review generation prompt
export function buildReviewPrompt(session: Session, reviewInstructions: string): string {
  const schema = `{
  "version": 1,
  "generatedAt": "<ISO 8601 timestamp>",
  "prNumber": ${session.prNumber || 'null'},
  "prTitle": ${session.prTitle ? JSON.stringify(session.prTitle) : 'null'},
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
  ]
}`

  const baseBranch = session.prBaseBranch || 'main'

  let prompt = `# PR Review Analysis

You are reviewing a pull request. Analyze the diff and produce a structured review.

## Instructions

1. Run \`git diff ${baseBranch}...HEAD\` to see the full diff
2. Examine the changed files to understand the context
3. Produce a structured JSON review and write it to \`.broomy-review/review.json\`

## Output Format

Write the following JSON to \`.broomy-review/review.json\`:

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
- Keep descriptions concise but informative.
- Use relative file paths from the repo root.
- Include specific line numbers where relevant.
`

  if (reviewInstructions) {
    prompt += `
## Additional Review Focus

${reviewInstructions}
`
  }

  prompt += `
## Action

Please analyze the PR now and write the result to \`.broomy-review/review.json\`.
`

  return prompt
}
