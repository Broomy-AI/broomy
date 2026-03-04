# Pre-Release Validation

Everything to verify before cutting a Broomy release. Work through these sections in order — each builds on the previous one.

## 1. Sync and Clean State

Start from a clean, up-to-date main branch:

```bash
git checkout main
git pull origin main
pnpm install
```

Verify there are no uncommitted changes and no WIP branches that should be merged first.

## 2. Automated Checks

Run the full validation suite:

```bash
# Or use /validate in Claude Code
pnpm lint
pnpm typecheck
pnpm check:all
pnpm test:unit
pnpm test:unit:coverage   # Must meet 90% line threshold
pnpm test:e2e
```

All six checks must pass. Fix any failures before continuing.

## 3. Release Screenshot Comparison

Compare the current UI against the last release to catch visual regressions:

```bash
pnpm release:compare
```

This checks out the last `v*` tag, builds that version, runs all feature walkthroughs to capture baseline screenshots, then does the same for the current code and generates a pixel-diff report. It only runs walkthroughs that existed at the last release — features added since then are skipped for the baseline (they'll appear as "added" in the report).

The report opens automatically in your browser. Review it for:

- **Changed screenshots** — are they intentional? Match each change to a commit.
- **Added screenshots** — these are from new feature walkthroughs. Verify they look correct.
- **Removed screenshots** — were these features intentionally removed?
- **Test failures** — any feature walkthroughs that crashed or produced no screenshots.

### AI-Assisted Review

After reviewing the report yourself, use Claude Code to get a structured assessment:

```
/release-readiness
```

This reads the comparison data, cross-references it with the commit log, and produces a readiness report (`release-compare/readiness-report.html`) with a verdict: Ready, Needs Review, or Not Ready.

To create a GitHub issue tracking the findings:

```
/release-compare-issue
```

## 4. Manual Smoke Test

Run the app and verify core workflows by hand. Automated tests cover a lot, but some things need human eyes:

**Session management:**
- Create a new session with a real repo
- Switch between sessions — terminal state should persist
- Rename and delete sessions

**Agent interaction:**
- Start an agent (Claude Code) in a session
- Verify agent status detection (working → idle transitions)
- Check that unread indicators appear when an agent finishes

**File operations:**
- Open files in the editor from the explorer
- Verify git diff view works for modified files
- Check that file changes from the agent appear in the explorer

**Panel system:**
- Toggle each panel (explorer, file viewer, settings)
- Drag to resize panels — verify constraints are respected
- Check that panel visibility persists across session switches

**Multi-window (if applicable):**
- Create a second profile/window
- Verify sessions are independent across windows

## 5. Platform-Specific Checks

### macOS (primary)
- App launches without Gatekeeper warnings (if signed)
- Menu bar items work (File, Edit, View, Window, Help)
- Keyboard shortcuts function (Cmd+N, Cmd+W, etc.)
- Native window controls (traffic lights) behave correctly

### Linux (if building)
- App launches from AppImage
- Terminal rendering is correct (font rendering can differ)
- File dialogs work

### Windows (if building)
- App launches from installer
- PTY/terminal works correctly (ConPTY vs winpty)
- Path handling is correct (backslashes, drive letters)

## 6. Performance Sanity Check

- App starts in a reasonable time (< 3 seconds to first paint)
- Switching sessions is instant (no visible delay)
- Terminal scrollback doesn't cause lag (scroll through a long history)
- Explorer file tree loads promptly for a medium-size repo (~1000 files)

## 7. Dependency Review

Check for known vulnerabilities and outdated critical packages:

```bash
pnpm audit
```

Address any high/critical vulnerabilities. Low-severity advisories in dev dependencies can be noted but don't need to block a release.

## 8. Cut the Release

Once everything passes, follow the release process in [releasing.md](releasing.md):

```bash
pnpm release:all <patch|minor|major>
```

## Quick Checklist

For copy-pasting into a release issue or PR:

```
- [ ] On main, up to date with origin
- [ ] pnpm lint — pass
- [ ] pnpm typecheck — pass
- [ ] pnpm check:all — pass
- [ ] pnpm test:unit — pass
- [ ] pnpm test:unit:coverage — meets 90% threshold
- [ ] pnpm test:e2e — pass
- [ ] pnpm release:compare — reviewed, no unexpected changes
- [ ] /release-readiness — verdict is Ready or Needs Review (with items addressed)
- [ ] Manual smoke test — core workflows verified
- [ ] pnpm audit — no high/critical vulnerabilities
- [ ] pnpm release:all <version> — released
```
