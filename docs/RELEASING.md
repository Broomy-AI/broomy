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

If the Apple Developer account is **not** the account your Mac is signed into, you cannot use Xcode's automatic certificate management. Follow these manual steps:

#### a. Generate a Certificate Signing Request (CSR)

```bash
# Open Keychain Access > Certificate Assistant > Request a Certificate From a Certificate Authority
# Or use the command line:
openssl req -new -newkey rsa:2048 -nodes \
  -keyout broomy-signing.key \
  -out broomy-signing.csr \
  -subj "/CN=Broomy Signing/O=Your Org"
```

Using Keychain Access (recommended):
1. Open **Keychain Access**
2. Menu: **Keychain Access > Certificate Assistant > Request a Certificate From a Certificate Authority...**
3. Enter the email address associated with the Apple Developer account
4. Select **Saved to disk**
5. Save the `.certSigningRequest` file

#### b. Create the Certificate in Apple Developer Portal

1. Go to [developer.apple.com/account/resources/certificates](https://developer.apple.com/account/resources/certificates/list)
2. Sign in with the **Developer account** (not your personal Apple ID)
3. Click **+** to create a new certificate
4. Select **Developer ID Application**
5. Upload the CSR file from step (a)
6. Download the resulting `.cer` file

#### c. Import the Certificate into Your Keychain

```bash
# Double-click the .cer file, or:
security import developer_id_application.cer -k ~/Library/Keychains/login.keychain-db
```

If you generated the CSR via command line (not Keychain Access), you also need to import the private key:

```bash
# Convert key to p12 format first
openssl pkcs12 -export -inkey broomy-signing.key -in developer_id_application.cer -out broomy-signing.p12
security import broomy-signing.p12 -k ~/Library/Keychains/login.keychain-db
```

#### d. Verify the Certificate is Installed

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
CSC_NAME="Developer ID Application: Your Name (TEAM_ID)"

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

## Building a Signed Release

### Quick Method

```bash
pnpm dist:signed
```

This script loads your `.env`, enables notarization, and runs the full build. See [what it does](#what-dist-signed-does) below.

### Manual Method

If you prefer to run each step yourself:

```bash
# 1. Set environment variables
export CSC_NAME="Developer ID Application: Your Name (TEAM_ID)"
export APPLE_ID="developer@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="XXXXXXXXXX"

# 2. Build and sign with notarization
pnpm build && electron-builder --mac -c.mac.notarize.teamId="$APPLE_TEAM_ID"

# 3. Verify the result is signed and notarized
codesign --verify --deep --strict dist/mac-arm64/Broomy.app
spctl --assess --type execute dist/mac-arm64/Broomy.app
```

## Publishing a GitHub Release

Once the signed artifacts are in `dist/`:

```bash
# 1. Bump the version in package.json (if you haven't already)
# 2. Commit and tag
git add package.json
git commit -m "Release v1.2.3"
git tag v1.2.3

# 3. Push
git push && git push --tags

# 4. Create the GitHub release
pnpm release
```

The `release` script runs:
```
gh release create v$version dist/*.dmg dist/*.zip --title "Broomy v$version" --generate-notes
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

This is fine. Code signing uses certificates in your **keychain**, not your macOS login. As long as you imported the certificate (step 1c), signing will work regardless of which Apple ID your Mac uses for iCloud.

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
