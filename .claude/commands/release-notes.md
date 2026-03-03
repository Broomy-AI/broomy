Generate human-readable release notes from commits since the last release.

## Steps

1. **Find the last release tag.** Run `git tag --list 'v*' --sort=-v:refname | head -n 1` to get the most recent release tag.

2. **Get the current version.** Run `node -p "require('./package.json').version"` to read the version from `package.json`.

3. **Gather all commits since the last release.** Run `git log <last-tag>..HEAD --format="%H %s" --no-merges` to get the full list of non-merge commits with their hashes and subjects.

4. **Read commit details.** For each commit (or groups of related commits), run `git show <hash> --stat --format="%B"` to understand what actually changed — the full commit message and which files were touched. Focus on understanding the *user-facing impact*, not the code mechanics.

5. **Categorize and write release notes.** Create `release-notes.md` in the project root with the following structure:

```markdown
# Broomy vX.Y.Z

One-sentence summary of the release theme (what's the headline?).

## What's New

- **Feature name** — One or two sentences explaining what it does and why it matters to the user. Write as if explaining to someone who uses Broomy daily but doesn't read code.

## Improvements

- **Area improved** — What got better and how the user will notice.

## Bug Fixes

- **What was broken** — What the user would have experienced, and that it's now fixed.
```

## Writing Guidelines

**Write for users, not developers.** These notes will be shown:
- On the GitHub release page
- In a "What's New" dialog when users upgrade
- On the home screen after updating

**Rules for good release notes:**
- Lead with the most exciting or impactful change
- Use plain language — no jargon, no file paths, no function names
- Each bullet should answer: "What changed, and why should I care?"
- Group related commits into a single bullet (e.g., 5 commits fixing the same feature = 1 bullet)
- Omit purely internal changes that users would never notice (refactors, CI changes, dependency bumps, test-only changes) — unless they fix a user-visible issue
- Use active voice: "Added dark mode" not "Dark mode was added"
- Be specific: "Fixed crash when opening large repositories" not "Fixed a bug"
- If a section would be empty, omit it entirely
- Keep the total length reasonable — aim for 5-15 bullets across all sections
- Don't include a section for internal/dev changes

**Tone:** Friendly, concise, confident. Like a teammate telling you what shipped.

## Output

Write the result to `release-notes.md` in the project root. This file is gitignored and will be consumed by the release scripts (`release.sh` and `release-all.sh`) when creating the GitHub release.

## Important

- If there are very few commits or only internal changes, it's fine to have a short release notes file — don't pad it.
- If you can't determine the user-facing impact of a commit from its message and changed files, include it with your best guess rather than omitting it.
- Never fabricate changes — only describe what actually happened in the commits.
