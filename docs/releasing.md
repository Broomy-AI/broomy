# Releasing Broomy

Step-by-step guide for building, signing, and publishing a release for macOS, Windows, and Linux.

## Quick Start

```bash
# 1. Run pre-release checks (see Pre-Release Checks section)
pnpm storybook:test            # Storybook visual regression
pnpm release:compare           # Feature walkthrough screenshot compare

# 2. Generate release notes (in Claude Code)
/release-notes

# 3. Run the full release pipeline
pnpm release:all <patch|minor|major>
```

This builds signed releases for all three platforms, bumps the version, and publishes a GitHub release. Requires macOS with signing credentials configured. See [Pre-Release Checks](#pre-release-checks) and [Full Release Pipeline](#full-release-pipeline) for details.

## Pre-Release Checks

Run these before cutting a release to catch regressions and verify everything works.

### 1. Automated checks

```bash
pnpm lint
pnpm typecheck
pnpm test:unit
```

The release pipeline runs these automatically, but it's worth catching failures early.

### 2. Storybook visual regression

Screenshots every Storybook story and diffs against reference images:

```bash
pnpm storybook:test
```

This generates a report at `.storybook-report/index.html`. Review any diffs — if the changes are intentional, accept them as the new baseline:

```bash
pnpm storybook:update-refs
```

### 3. Feature walkthrough screenshot compare

Runs all feature walkthrough specs against the last release tag and compares screenshots:

```bash
pnpm release:compare
```

This generates a report at `release-compare/index.html`. Use `/release-readiness` in Claude Code to analyze the report and produce a readiness assessment. If there are issues, use `/release-compare-issue` to create a GitHub issue for tracking.

### 4. Generate release notes

```bash
# In Claude Code:
/release-notes
```

This creates `release-notes.md` with categorized changes (new features, improvements, bug fixes) since the last tag.

## Prerequisites

- macOS (required for code signing and notarization)
- [Xcode](https://developer.apple.com/xcode/) installed (for `codesign` and `notarytool`)
- A paid [Apple Developer Program](https://developer.apple.com/programs/) membership
- [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated
- [Docker](https://www.docker.com/) installed (for Linux native module prebuilds)
- GNU binutils (`brew install binutils`) — required for valid `.deb` packages; see
  [.deb build needs GNU ar](#deb-build-needs-gnu-ar-macos)

## Platform Build Commands

| Command | What it builds | Notes |
|---|---|---|
| `pnpm dist:signed` | macOS (signed + notarized) | Requires Apple credentials |
| `pnpm dist:mac` | macOS (unsigned) | For local testing |
| `pnpm dist:win` | Windows x64 (NSIS installer + portable) | Cross-compiles from macOS |
| `pnpm dist:linux` | Linux x64 + arm64 (AppImage + .deb) | Requires prebuilds (see below) |
| `pnpm dist:all` | All platforms | macOS signed, Windows + Linux unsigned |

### Build Artifacts

| Platform | Architectures | Artifacts |
|---|---|---|
| macOS | arm64 (Apple Silicon) | `.dmg`, `.zip` |
| Windows | x64 | `.exe` (NSIS installer), `.exe` (portable) |
| Linux | x64, arm64 | `.AppImage`, `.deb` |

## Full Release Pipeline

The `pnpm release:all <patch|minor|major> [--skip-build] [--no-bump]` command runs these steps:

1. Pre-flight checks (must be on `main`, clean working tree, signing credentials)
2. Lint, typecheck, and unit tests
3. Version bump (`package.json` + `website/package.json`)
4. Commit version bump and create `vX.Y.Z` tag (local only at this point)
5. Build all platforms via `pnpm dist:all` (macOS signed, Windows + Linux unsigned)
6. Confirmation prompt showing version, tag, and all artifacts
7. Push version bump commit and tag to `main` on origin
8. Create GitHub release with all artifacts and release notes

The script handles everything end-to-end — no separate push, merge, or PR is needed. The version bump is committed directly to `main` and pushed as part of the release.

Options:
- `--skip-build` — Skip step 5 and use existing artifacts in `dist/` (useful if you already ran `pnpm dist:all`).
- `--no-bump` — Skip steps 3-4 and release the current version as-is. Useful for retrying a failed release without bumping again.

If anything fails, the script stops immediately. If you decline at the confirmation prompt, the commit and tag remain local-only (the script prints undo instructions).

**Before running**, use `/release-notes` in Claude Code to generate `release-notes.md`. The script uses this file for the GitHub release body. If missing, it falls back to GitHub's auto-generated notes.

## One-Time Setup

### macOS Code Signing

#### 1. Create a Developer ID Certificate

You need a **Developer ID Application** certificate.

**Using Xcode (recommended):**

1. Open **Xcode > Settings > Accounts**
2. Click **+** and sign in with the Apple Developer account
3. Select the account, click **Manage Certificates**
4. Click **+** and choose **Developer ID Application**
5. Xcode creates the certificate and installs it in your keychain

**Manual method:**

1. Generate a CSR in **Keychain Access > Certificate Assistant > Request a Certificate From a Certificate Authority**
2. Go to [developer.apple.com/account/resources/certificates](https://developer.apple.com/account/resources/certificates/list)
3. Click **+**, select **Developer ID Application**, and upload the CSR
4. Download the `.cer` file and double-click to import into your keychain

**Verify:**

```bash
security find-identity -v -p codesigning
# Should show: "Developer ID Application: Your Name (TEAM_ID)"
```

#### 2. Create an App-Specific Password

1. Go to [appleid.apple.com](https://appleid.apple.com/)
2. Sign in with the **Developer account**
3. Go to **Sign-In and Security > App-Specific Passwords**
4. Generate a password named "Broomy Notarization"

#### 3. Store Credentials

Create a `.env` file in the project root (already in `.gitignore`):

```bash
# .env — macOS signing credentials
CSC_NAME="Your Name (TEAM_ID)"
APPLE_ID="developer@example.com"
APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
APPLE_TEAM_ID="XXXXXXXXXX"
```

Alternatively, store notarization credentials in the macOS keychain:

```bash
xcrun notarytool store-credentials "broomy-notarize" \
  --apple-id "developer@example.com" \
  --team-id "XXXXXXXXXX" \
  --password "xxxx-xxxx-xxxx-xxxx"
```

### Linux Prebuilds

Linux packages include pre-compiled `node-pty` native modules. Build them once (and again when Electron or node-pty versions change):

```bash
pnpm build:linux-prebuilds
```

This uses Docker to cross-compile for both x64 and arm64. Prebuilds are stored in `build/node-pty-prebuilds/` (gitignored).

## Manual Method

If you prefer to run each step yourself (replicates what `release:all` does):

```bash
# 1. Pre-flight: must be on main with a clean working tree
git status

# 2. Run checks
pnpm lint
pnpm typecheck
pnpm test:unit

# 3. Bump version, commit, and tag (before building so artifacts get the new version)
pnpm version:bump patch       # or minor/major
git add package.json website/package.json
git commit -m "Release v1.2.3"
git tag v1.2.3

# 4. Build all platforms (picks up the new version from package.json)
rm -rf dist
pnpm dist:all                 # macOS signed, Windows + Linux unsigned

# 5. Verify artifacts look correct, then push and publish
git push && git push --tags
gh release create v1.2.3 dist/*.dmg dist/*.zip dist/*.exe dist/*.AppImage dist/*.deb dist/*.yml \
  --title "Broomy v1.2.3" \
  --notes-file release-notes.md
```

If you need to undo before pushing: `git reset --soft HEAD~1 && git tag -d v1.2.3`

## Building a Single Platform (Without Publishing)

```bash
pnpm dist:signed     # macOS signed + notarized
pnpm dist:mac        # macOS unsigned
pnpm dist:win        # Windows
pnpm dist:linux      # Linux
```

All artifacts are placed in `dist/`.

## Troubleshooting

### macOS

#### "No identity found for signing"

Your certificate isn't in the keychain, or `CSC_NAME` doesn't match. Run:
```bash
security find-identity -v -p codesigning
```
and make sure `CSC_NAME` exactly matches one of the listed identities.

#### "Unable to notarize" / notarization fails

- Ensure `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` are all set correctly
- The Apple ID must belong to the Developer Program team
- App-specific passwords expire if your Apple ID password changes — regenerate if needed
- Check the notarization log:
  ```bash
  xcrun notarytool history --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD"
  ```

#### Notarization is slow

Notarization typically takes 2-10 minutes. electron-builder waits automatically.

#### Verifying a macOS release artifact

```bash
codesign --verify --deep --strict --verbose=2 dist/mac-arm64/Broomy.app
spctl --assess --type execute --verbose dist/mac-arm64/Broomy.app
spctl --assess --type open --context context:primary-signature dist/*.dmg
```

### Windows

#### SmartScreen warnings

Windows builds are unsigned, so users see a SmartScreen warning on first launch. They can click "More info" > "Run anyway". The warning goes away once enough users have downloaded the app and Windows builds reputation.

#### Cross-compilation issues

Windows builds are cross-compiled from macOS using electron-builder. If you encounter issues with native modules, ensure `node-pty` is properly listed in `asarUnpack` in `electron-builder.yml`.

### Linux

#### "Linux prebuilds not found"

Run `pnpm build:linux-prebuilds` first. This uses Docker to compile native modules for Linux.

#### Docker not installed

The prebuild script requires Docker. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (macOS/Windows) or Docker Engine (Linux).

#### .deb build fails with 'ar' not found (macOS)

The `.deb` build shells out to `ar`, which won't run until the Xcode license is accepted:
```bash
sudo xcodebuild -license
```

#### .deb build needs GNU ar (macOS)

Building `.deb` packages on macOS requires GNU `ar`:

```bash
brew install binutils
```

`fpm` assembles the `.deb` with whichever `ar` comes first on `PATH`. electron-builder's
bundled `linux-tools` provides only `gtar` and `lzip`, so without binutils that resolves to
Apple's BSD `ar` — which cannot write the Debian archive format. It produces a 96-byte stub
containing nothing but a symbol table **and exits successfully**, so the build appears to
pass. Releases up to and including v1.1.0 shipped `.deb` files built this way.

`scripts/dist-linux.sh` now detects GNU `ar` (preferring the keg-only binutils install),
fails with instructions if it is missing, and verifies every `.deb` really is a Debian
archive before the build is considered done.
