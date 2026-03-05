Run the full test suite with coverage, cache the results, and report overall coverage.

## Steps

1. Run `pnpm test:unit:coverage` to execute all unit tests with coverage enabled. Capture the output.
2. Copy `coverage/coverage-summary.json` to `.broomy/output/coverage-summary.json` (create the directory if needed).
3. Run `node scripts/coverage-utils.cjs lookup` (no file argument) to display the overall coverage summary.
4. Report the results:
   - Overall line coverage %
   - Whether it meets the 90% threshold
   - Path to cached summary: `.broomy/output/coverage-summary.json`
   - Tell the caller: use `/coverage-check <file>` for incremental single-file checks, or `/coverage-increase` to automatically improve coverage.

## Rules

- Always run the full suite — this is the authoritative baseline.
- If `pnpm test:unit:coverage` fails due to test failures (not coverage threshold), fix the tests first before proceeding.
- If it fails only due to coverage threshold, still cache the summary and report — the caller can use `/coverage-increase` to fix gaps.
