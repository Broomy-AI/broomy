#!/usr/bin/env bash
set -euo pipefail

# release-all.sh - Full release pipeline: check, bump, build, sign, publish
#
# Usage: pnpm release:all <patch|minor|major>

BUMP_TYPE="${1:-}"

if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo "Usage: pnpm release:all <patch|minor|major>"
  exit 1
fi

cd "$(dirname "$0")/.."

# --- Pre-flight: branch and working tree ---
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
  echo "Error: Must be on 'main' branch (currently on '$BRANCH')"
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Error: Working tree is not clean. Commit or stash changes first."
  git status --short
  exit 1
fi

# --- Pre-flight: Broomy not running from dist/ ---
if [ -d dist ]; then
  BROOMY_PIDS=$(pgrep -f "dist/.*Broomy" 2>/dev/null || true)
  if [ -n "$BROOMY_PIDS" ]; then
    echo ""
    echo "Error: Broomy is running from dist/. Quit it before releasing."
    echo "  PIDs: $BROOMY_PIDS"
    exit 1
  fi
fi

# --- Pre-flight: signing credentials ---
if [ -f .env ]; then
  echo "Loading credentials from .env"
  set -a
  source .env
  set +a
fi

missing=()
[ -z "${CSC_NAME:-}" ] && missing+=("CSC_NAME")
[ -z "${APPLE_ID:-}" ] && missing+=("APPLE_ID")
[ -z "${APPLE_APP_SPECIFIC_PASSWORD:-}" ] && missing+=("APPLE_APP_SPECIFIC_PASSWORD")
[ -z "${APPLE_TEAM_ID:-}" ] && missing+=("APPLE_TEAM_ID")

if [ ${#missing[@]} -gt 0 ]; then
  echo ""
  echo "Error: Missing required environment variables:"
  for var in "${missing[@]}"; do
    echo "  - $var"
  done
  echo ""
  echo "Set them in .env or export them before running this script."
  echo "See docs/releasing.md for setup instructions."
  exit 1
fi

# --- Run checks ---
echo ""
echo "Running lint, typecheck, and unit tests..."
pnpm lint
pnpm typecheck
pnpm test:unit

# --- Bump version ---
echo ""
echo "Bumping version ($BUMP_TYPE)..."
pnpm version:bump "$BUMP_TYPE"

# Read the new version from package.json
NEW_VERSION=$(node -p "require('./package.json').version")
TAG="v$NEW_VERSION"

# --- Commit and tag ---
echo ""
echo "Committing version bump and tagging $TAG..."
git add package.json website/package.json
git commit -m "Release $TAG"
git tag "$TAG"

# --- Build, sign, notarize (macOS) ---
echo ""
echo "Building, signing, and notarizing macOS..."
pnpm dist:signed

# --- Build Linux ---
echo ""
echo "Building Linux packages..."
pnpm dist:linux

# --- Confirm before publishing ---
echo ""
echo "============================================"
echo "  Ready to publish"
echo "============================================"
echo "  Version:  $NEW_VERSION"
echo "  Tag:      $TAG"
echo "  Artifacts:"
for f in dist/*.dmg dist/*.zip dist/*.AppImage dist/*.yml; do
  [ -f "$f" ] && echo "    $(basename "$f")"
done
echo "============================================"
echo ""
read -r -p "Push and create GitHub release? [y/N] " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Aborted. The commit and tag are local-only."
  echo "To undo: git reset --soft HEAD~1 && git tag -d $TAG"
  exit 1
fi

# --- Push ---
echo ""
echo "Pushing to origin..."
git push
git push --tags

# --- Create GitHub release ---
echo ""
echo "Creating GitHub release..."

RELEASE_FILES=()
for f in dist/*.dmg dist/*.zip dist/*.AppImage dist/*.yml; do
  [ -f "$f" ] && RELEASE_FILES+=("$f")
done

NOTES_ARGS=()
if [ -f release-notes.md ]; then
  echo "Using release notes from release-notes.md"
  NOTES_ARGS=(--notes-file release-notes.md)
else
  echo "Warning: release-notes.md not found. Run '/release-notes' first for better release notes."
  echo "Falling back to auto-generated notes."
  NOTES_ARGS=(--generate-notes)
fi

gh release create "$TAG" "${RELEASE_FILES[@]}" \
  --title "Broomy $TAG" \
  "${NOTES_ARGS[@]}"

echo ""
echo "Done! Release $TAG published."
echo "https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/releases/tag/$TAG"
