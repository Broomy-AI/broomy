// Build the create-PR prompt for the agent
export function buildCreatePrPrompt(baseBranch: string): string {
  return `# Create Pull Request

You are creating a pull request for the current branch. Analyze the changes and create a well-structured PR.

## Instructions

1. Run \`git diff origin/${baseBranch}...HEAD\` to see the full diff
2. Run \`git log origin/${baseBranch}..HEAD --oneline\` to understand the commit history
3. Check for a PR template in these locations (use the first one found):
   - \`.github/PULL_REQUEST_TEMPLATE.md\`
   - \`.github/pull_request_template.md\`
   - \`PULL_REQUEST_TEMPLATE.md\`
   - \`docs/pull_request_template.md\`

## PR Body

**If a PR template exists**: Follow it, filling in each section based on your analysis of the diff and commit history.

**If no template exists**: Create the PR body with these sections:

### Background and Motivation
Why this change is being made. Reference the linked issue if any.

### Design Decisions
Key architectural or implementation choices and why they were made.

### Proposed Changes
Group changes by pattern (e.g. "New API endpoint", "Database migration", "UI updates"). Don't just list files — describe what each group of changes does.

### Testing
How the changes were tested or should be tested.

## PR Title

Derive the title by considering:
- The linked issue (if the branch name contains an issue number)
- What the changes actually do (from the diff)
- The branch name
- The commit history

Look at recent merged PRs for title style conventions: \`gh pr list --state merged --limit 5\`

The title should clearly and concisely describe what the changes are. Keep it under 70 characters.

## Screenshots

If the repo has an obvious way to generate screenshot walkthroughs (e.g. a feature-docs test system, Storybook, or similar), suggest including them in the PR body.

## Action

1. Create the PR:
   \`\`\`
   gh pr create --title "<title>" --body "<body>"
   \`\`\`
2. After creating the PR, write the result to \`.broomy/pr-result.json\`:
   \`\`\`json
   {
     "url": "<the PR URL returned by gh>",
     "number": <PR number>,
     "title": "<the title you used>"
   }
   \`\`\`
`
}
