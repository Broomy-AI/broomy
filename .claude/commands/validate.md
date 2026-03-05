Run the full verification checklist and fix any failures.

## Steps

1. Run `pnpm lint`. If there are lint errors, fix them in the source files and re-run until clean.
2. Run `pnpm typecheck`. If there are type errors, fix them and re-run until clean.
3. Run `pnpm check:all`. If any project-specific checks fail, fix them and re-run until clean.
4. Run `pnpm test:unit`. If any unit tests fail, read the failing test and the source code it tests, fix the issue (in the source or the test as appropriate), and re-run until all pass.
5. Run `/coverage-run` to execute the full test suite with coverage and cache the results. If coverage drops below 90% on any targeted file, use `/coverage-increase` to add tests and bring it back above threshold.
6. Run `pnpm test:e2e`. If any E2E tests fail, investigate and fix the issue, then re-run until passing.

## Rules

- Fix the root cause, not the symptom. Don't delete tests or weaken assertions to make things pass.
- If a lint or type error is in code you didn't write, fix it anyway — the goal is a green checklist.
- After each fix, re-run only the failing check (not the whole sequence) to verify the fix before moving on.
- When all 6 checks pass, report the results as a summary.
