#!/usr/bin/env bash
set -euo pipefail

# dist-signed.sh - Build, sign, and notarize Broomy for macOS
#
# Usage: pnpm dist:signed
#
# Reads signing credentials from .env or the environment.
# See docs/RELEASING.md for setup instructions.

cd "$(dirname "$0")/.."

# --- Load .env if present ---
if [ -f .env ]; then
  echo "Loading credentials from .env"
  set -a
  source .env
  set +a
fi

# --- Check required variables ---
missing=()
[ -z "${CSC_NAME:-}" ] && missing+=("CSC_NAME")
[ -z "${APPLE_ID:-}" ] && missing+=("APPLE_ID")
[ -z "${APPLE_APP_SPECIFIC_PASSWORD:-}" ] && missing+=("APPLE_APP_SPECIFIC_PASSWORD")
[ -z "${APPLE_TEAM_ID:-}" ] && missing+=("APPLE_TEAM_ID")

if [ ${#missing[@]} -gt 0 ]; then
  echo ""
  echo "ERROR: Missing required environment variables:"
  for var in "${missing[@]}"; do
    echo "  - $var"
  done
  echo ""
  echo "Set them in .env or export them before running this script."
  echo "See docs/RELEASING.md for setup instructions."
  exit 1
fi

# --- Verify signing identity exists in keychain ---
echo ""
echo "Checking for signing identity..."
if ! security find-identity -v -p codesigning | grep -q "$CSC_NAME"; then
  echo "ERROR: Signing identity not found in keychain:"
  echo "  $CSC_NAME"
  echo ""
  echo "Available identities:"
  security find-identity -v -p codesigning
  echo ""
  echo "See docs/RELEASING.md for certificate setup instructions."
  exit 1
fi
echo "  Found: $CSC_NAME"

# --- Build ---
echo ""
echo "Building app..."
pnpm build

# --- Package, sign, and notarize ---
echo ""
echo "Packaging, signing, and notarizing..."
echo "  (Notarization may take several minutes)"
electron-builder --mac \
  -c.mac.notarize.teamId="$APPLE_TEAM_ID"

# --- Verify ---
echo ""
echo "Verifying code signature..."
APP_PATH=$(find dist -maxdepth 2 -name "Broomy.app" -type d | head -1)
if [ -z "$APP_PATH" ]; then
  echo "WARNING: Could not find Broomy.app in dist/ to verify."
else
  codesign --verify --deep --strict "$APP_PATH"
  echo "  Code signature: OK"

  echo "Checking notarization..."
  if spctl --assess --type execute "$APP_PATH" 2>/dev/null; then
    echo "  Notarization: OK"
  else
    echo "  WARNING: Gatekeeper assessment failed. The app may not have been notarized."
    echo "  This can happen if notarization is still processing. Check with:"
    echo "    xcrun notarytool history --apple-id \"\$APPLE_ID\" --team-id \"\$APPLE_TEAM_ID\" --password \"\$APPLE_APP_SPECIFIC_PASSWORD\""
  fi
fi

echo ""
echo "Done! Signed artifacts are in dist/"
echo "To publish a GitHub release, run: pnpm release"
