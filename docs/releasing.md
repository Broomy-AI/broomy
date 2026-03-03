# Releasing Broomy

Step-by-step guide for building, signing, notarizing, and publishing a release.

## Prerequisites

- macOS (code signing and notarization are macOS-only)
- [Xcode](https://developer.apple.com/xcode/) installed (for `codesign` and `notarytool`)
- A paid [Apple Developer Program](https://developer.apple.com/programs/) membership
- [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated

## One-Time Setup

### 1. Create a Developer ID Certificate

You need a **Developer ID Application** certificate. This is different from development/distribution certificates used for App Store apps.

#### Using Xcode (recommended)

Xcode can create and install certificates automatically, even if the Developer account is not the Apple ID your Mac is signed into. Just add the Developer account in Xcode:

1. Open **Xcode > Settings > Accounts**
2. Click **+** and sign in with the Apple Developer account
3. Select the account, click **Manage Certificates**
4. Click **+** and choose **Developer ID Application**
5. Xcode creates the certificate and installs it in your keychain automatically

#### Manual method (alternative)

If you prefer not to use Xcode, you can create the certificate manually:

1. Generate a CSR in **Keychain Access > Certificate Assistant > Request a Certificate From a Certificate Authority**
2. Go to [developer.apple.com/account/resources/certificates](https://developer.apple.com/account/resources/certificates/list)
3. Click **+**, select **Developer ID Application**, and upload the CSR
4. Download the `.cer` file and double-click to import it into your keychain

#### Verify the Certificate is Installed

```bash
security find-identity -v -p codesigning
```

You should see a line like:

```
1) ABCDEF1234... "Developer ID Application: Your Name (TEAM_ID)"
```

Note the **Team ID** in parentheses -- you'll need it later.

### 2. Create an App-Specific Password

Apple notarization requires an app-specific password (your regular Apple ID password won't work).

1. Go to [appleid.apple.com](https://appleid.apple.com/)
2. Sign in with the **Developer account**
3. Go to **Sign-In and Security > App-Specific Passwords**
4. Click **Generate an app-specific password**
5. Name it something like "Broomy Notarization"
6. Save the generated password securely

### 3. Store Credentials

Create a `.env` file in the project root (it's already in `.gitignore`):

```bash
# .env
# Apple code signing identity (exact string from `security find-identity`)
CSC_NAME="Your Name (TEAM_ID)"

# For notarization
APPLE_ID="developer@example.com"
APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
APPLE_TEAM_ID="XXXXXXXXXX"
```

Alternatively, you can store the notarization credentials in the macOS keychain so they don't sit in a file:

```bash
xcrun notarytool store-credentials "broomy-notarize" \
  --apple-id "developer@example.com" \
  --team-id "XXXXXXXXXX" \
  --password "xxxx-xxxx-xxxx-xxxx"
```

## Full Release (Recommended)

The easiest way to cut a release is the all-in-one script:

```bash
# 1. Generate release notes (run /release-notes in Claude Code before the script)
# 2. Run the release pipeline
pnpm release:all <patch|minor|major>
```

**Before running the script**, use `/release-notes` in Claude Code to generate `release-notes.md`. The release script will use this file for the GitHub release body. If the file is missing, it falls back to GitHub's auto-generated notes.

This runs the entire pipeline in order:

1. Pre-flight checks (must be on `main`, clean working tree, signing credentials present)
2. Lint, typecheck, and unit tests
3. Version bump (`package.json` + `website/package.json`)
4. Commit and tag (`vX.Y.Z`)
5. Signed build with notarization (`pnpm dist:signed`)
6. Confirmation prompt showing version, tag, and artifacts
7. Push commit and tag to origin
8. Create GitHub release with artifacts and release notes

If anything fails, the script stops immediately. If you decline at the confirmation prompt, the commit and tag remain local-only (the script prints undo instructions).

## Building a Signed Release (Without Publishing)

If you only want to build without publishing:

```bash
pnpm dist:signed
```

This script loads your `.env`, enables notarization, and runs the full build. See [what it does](#what-dist-signed-does) below.

## Manual Method

If you prefer to run each step yourself:

```bash
# 1. Set environment variables
export CSC_NAME="Your Name (TEAM_ID)"
export APPLE_ID="developer@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="XXXXXXXXXX"

# 2. Build and sign with notarization
pnpm build && electron-builder --mac -c.mac.notarize.teamId="$APPLE_TEAM_ID"

# 3. Verify the result is signed and notarized
codesign --verify --deep --strict dist/mac-arm64/Broomy.app
spctl --assess --type execute dist/mac-arm64/Broomy.app

# 4. Bump the version, commit, tag, push
pnpm version:bump patch
git add package.json website/package.json
git commit -m "Release v1.2.3"
git tag v1.2.3
git push && git push --tags

# 5. Create the GitHub release
pnpm release
```

## What `dist:signed` Does

The `pnpm dist:signed` script:

1. Loads credentials from `.env` (if present) or uses existing environment variables
2. Checks that `CSC_NAME`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` are set
3. Verifies your signing certificate is in the keychain
4. Runs `pnpm build` to compile the app
5. Runs `electron-builder --mac` with `-c.mac.notarize.teamId` to override the default `notarize: false` in `electron-builder.yml`
6. Verifies the output is properly code-signed and notarized

## Troubleshooting

### "No identity found for signing"

Your certificate isn't in the keychain, or `CSC_NAME` doesn't match. Run:
```bash
security find-identity -v -p codesigning
```
and make sure `CSC_NAME` exactly matches one of the listed identities.

### "Unable to notarize" / notarization fails

- Ensure `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` are all set correctly
- The Apple ID must belong to the Developer Program team
- App-specific passwords expire if your Apple ID password changes -- regenerate if needed
- Check Apple's notarization log for details:
  ```bash
  xcrun notarytool log <submission-id> --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD"
  ```

### "The developer account is not the account my Mac is signed into"

This is fine. You can add any Apple Developer account in Xcode (Settings > Accounts) and create certificates from there, regardless of which Apple ID your Mac uses for iCloud.

### Notarization is slow

Notarization typically takes 2-10 minutes. electron-builder waits for it automatically. If it times out, you can check status manually:

```bash
xcrun notarytool history --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD"
```

### Verifying a release artifact

```bash
# Check code signature
codesign --verify --deep --strict --verbose=2 dist/mac-arm64/Broomy.app

# Check notarization (Gatekeeper assessment)
spctl --assess --type execute --verbose dist/mac-arm64/Broomy.app

# Check stapled notarization ticket on DMG
spctl --assess --type open --context context:primary-signature dist/*.dmg
```
