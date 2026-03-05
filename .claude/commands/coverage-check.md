Check and update coverage for a single file without re-running the full test suite.

Arguments: $ARGUMENTS (the source file path, e.g. `src/renderer/store/sessions.ts`)

## Steps

1. Parse the source file path from `$ARGUMENTS`. If no argument is provided, print usage and stop.
2. If `.broomy/output/coverage-summary.json` exists, run `node scripts/coverage-utils.cjs lookup <file>` to show the current cached coverage for this file.
3. Derive the test file path by replacing `.ts` with `.test.ts` (or `.tsx` with `.test.tsx`). Verify the test file exists.
4. Run `pnpm vitest run --coverage <test-file>` to execute only that file's tests with coverage. This generates a fresh `coverage/coverage-summary.json` with data for the tested file.
5. Run `node scripts/coverage-utils.cjs update <file> coverage/coverage-summary.json` to merge the new coverage data into the cached summary.
6. Report:
   - The file's new line coverage %
   - The new overall aggregate line coverage %
   - Whether the file meets the 90% threshold
   - If below 90%, suggest writing more tests and re-running `/coverage-check <file>`

## Rules

- This skill requires a cached summary from a prior `/coverage-run`. If the cache doesn't exist, tell the caller to run `/coverage-run` first.
- Only run the single test file, not the full suite — that's the whole point of this skill.
- If the test file doesn't exist, tell the caller and suggest creating it.
