Iteratively increase test coverage to meet the 90% line threshold on all files.

## Steps

1. Run `/coverage-run` to get the authoritative baseline coverage.
2. Run `node scripts/coverage-utils.cjs below 90` to list all files below the 90% threshold, sorted worst-first.
3. If no files are below 90%, report success and stop.
4. For each under-covered file (worst coverage first):
   a. Read the source file to understand its logic and identify untested code paths.
   b. Read the corresponding test file (co-located as `*.test.ts` or `*.test.tsx`). If no test file exists, create one following patterns from `docs/testing-guide.md`.
   c. Write new test cases targeting the uncovered lines/branches. Focus on tests that catch real bugs, not just coverage padding.
   d. Run `/coverage-check <file>` to verify coverage improved.
   e. If still below 90%, read the updated coverage data, write more tests, and re-run `/coverage-check <file>`. Repeat until the file reaches 90% or you've made 3 attempts.
5. After addressing all files, run `/coverage-run` again for the true aggregate result.
6. Report final results:
   - Overall line coverage %
   - Which files improved and by how much
   - Any files that still couldn't reach 90% (and why)

## Rules

- Fix the root cause, not the symptom. Don't write meaningless tests just to hit a number.
- Follow the project's testing patterns from `docs/testing-guide.md` — test store actions and pure functions, not component rendering.
- Use the mocking patterns from `src/test/setup.ts`.
- If a file legitimately can't reach 90% (e.g., it's mostly error handling for edge cases that are hard to trigger), note it in the report rather than writing brittle tests.
- Limit to 3 attempts per file to avoid infinite loops.
