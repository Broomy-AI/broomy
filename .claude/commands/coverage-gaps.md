Find untested code and suggest what to test next.

## Steps

1. **Run coverage.** Execute `/coverage-run` to run the full test suite with coverage and cache the results. Then run `node scripts/coverage-utils.cjs below 90` to list files below threshold. Use `/coverage-check <file>` to verify individual files after writing new tests.

2. **Read the coverage config.** Check `vitest.config.ts` to see which files are in the coverage target list. Note any source files with testable logic that are NOT in the coverage list but should be.

3. **Analyze each under-covered file.** For each file below 90% coverage:
   - Read the source file
   - Read its test file (co-located as `*.test.ts`)
   - Identify which functions/branches/lines are not covered
   - Determine why they're not covered (missing test cases, untested error paths, complex conditional logic)

4. **Check for files with no tests at all.** Scan `src/renderer/utils/`, `src/renderer/store/`, and other testable directories for `.ts` files that have no corresponding `.test.ts` file. Flag any that contain logic worth testing (skip files that are purely type definitions or re-exports).

5. **Generate a prioritized report:**

   **Critical (below 90%, blocking CI):**
   - File name, current coverage %, lines/branches not covered
   - Specific test cases needed to close the gap

   **Recommended (not in coverage target but should be):**
   - Files with testable logic that aren't tracked
   - What coverage adding them would require

   **Edge cases worth testing:**
   - Error paths in store actions
   - Boundary conditions in utility functions
   - Race conditions in async operations

6. **For each gap, suggest a concrete test.** Don't just say "add a test for X" — write the actual test stub showing the test description, setup, action, and assertion pattern. Follow the project's testing patterns from `docs/testing-guide.md`.

## Rules

- Focus on tests that catch real bugs, not tests that just boost coverage numbers.
- Follow the project convention: test pure functions and store actions, not React component rendering.
- Use the mocking patterns from `src/test/setup.ts` — `vi.mocked(window.xyz.method).mockResolvedValue(...)`.
- Don't suggest testing trivial code (simple re-exports, type definitions, one-line getters).
