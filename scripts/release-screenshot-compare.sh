#!/usr/bin/env bash
set -euo pipefail

# Release Screenshot Compare
# Generates screenshots from the last release tag and current code,
# then compares them pixel-by-pixel to produce a visual diff report.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="$PROJECT_DIR/release-compare"
FEATURES_DIR="$PROJECT_DIR/tests/features"

# Colors for output
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
CYAN='\033[36m'
RESET='\033[0m'

step_num=0
total_steps=7

progress() {
  step_num=$((step_num + 1))
  echo ""
  echo -e "${BOLD}${CYAN}[$step_num/$total_steps]${RESET} ${BOLD}$1${RESET}"
  echo -e "${DIM}$(printf '%.0s─' {1..60})${RESET}"
}

info() {
  echo -e "  ${DIM}→${RESET} $1"
}

success() {
  echo -e "  ${GREEN}✓${RESET} $1"
}

warn() {
  echo -e "  ${YELLOW}⚠${RESET} $1"
}

fail() {
  echo -e "  ${RED}✗${RESET} $1"
}

# Run feature walkthroughs one at a time with progress reporting.
# Discovers which features exist at the currently checked-out ref,
# so baseline runs won't attempt features added after that release.
# Args: $1 = label (e.g. "baseline"), $2 = target dir, $3 = results json path, $4 = ref label
run_walkthroughs() {
  local label="$1"
  local target_dir="$2"
  local results_json="$3"
  local ref_label="$4"

  # Discover features that exist at THIS ref (not the pre-checkout list)
  local features=()
  for dir in "$FEATURES_DIR"/*/; do
    local name
    name=$(basename "$dir")
    if [ "$name" != "_shared" ] && ls "$dir"*.spec.ts &>/dev/null; then
      features+=("$name")
    fi
  done
  local feature_count=${#features[@]}
  info "Found $feature_count feature walkthroughs at $ref_label"

  # Clean all existing screenshots before running
  for feature in "${features[@]}"; do
    rm -rf "$FEATURES_DIR/$feature/screenshots"
  done

  local passed=0
  local failed=0
  local failed_features=""
  local all_errors=""
  local i=0

  for feature in "${features[@]}"; do
    i=$((i + 1))
    echo -ne "  ${DIM}[$i/$feature_count]${RESET} $feature... "

    local output_file
    output_file=$(mktemp)
    local exit_code=0

    npx playwright test --config playwright.features.config.ts "tests/features/$feature/" > "$output_file" 2>&1 || exit_code=$?

    if [ -d "$FEATURES_DIR/$feature/screenshots" ]; then
      mkdir -p "$target_dir/$feature"
      cp "$FEATURES_DIR/$feature/screenshots/"*.png "$target_dir/$feature/" 2>/dev/null || true
      local count
      count=$(ls "$target_dir/$feature/"*.png 2>/dev/null | wc -l | tr -d ' ')
      echo -e "${GREEN}✓${RESET} $count screenshot(s)"
      passed=$((passed + 1))
    else
      echo -e "${RED}✗${RESET} failed"
      failed=$((failed + 1))
      failed_features="$failed_features $feature"
      all_errors="$all_errors$(cat "$output_file")\n"
    fi

    # Clean up screenshots and HTML so they don't get committed
    rm -rf "$FEATURES_DIR/$feature/screenshots"
    rm -f "$FEATURES_DIR/$feature/index.html"
    rm -f "$output_file"
  done

  rm -f "$FEATURES_DIR/index.html"

  # Write results JSON
  node -e "
const fs = require('fs');
const results = {
  ref: process.argv[1],
  passed: parseInt(process.argv[2]),
  failed: parseInt(process.argv[3]),
  failedFeatures: process.argv[4].trim().split(/\s+/).filter(Boolean),
  errors: process.argv[5]
};
fs.writeFileSync(process.argv[6], JSON.stringify(results, null, 2));
" "$ref_label" "$passed" "$failed" "$failed_features" "$all_errors" "$results_json"

  echo ""
  if [ $failed -eq 0 ]; then
    success "All $passed walkthroughs passed"
  else
    success "$passed passed, $failed failed"
  fi
}

# ──────────────────────────────────────────────────────────────
# Step 1: Pre-flight checks
# ──────────────────────────────────────────────────────────────
progress "Pre-flight checks"

cd "$PROJECT_DIR"

# Check for uncommitted changes (hard fail)
if [ -n "$(git status --porcelain)" ]; then
  fail "Uncommitted changes detected. Please commit or stash before running."
  echo ""
  git status --short
  exit 1
fi
success "Working tree is clean"

# Record current branch for later restoration
ORIGINAL_REF=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse HEAD)
info "Current branch: $ORIGINAL_REF"

# Warn if not on main
CURRENT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "")
if [ "$CURRENT_BRANCH" != "main" ]; then
  warn "Not on main branch (on '$CURRENT_BRANCH'). Comparing against last release tag anyway."
fi

# Warn if main is behind origin/main
if git rev-parse --verify origin/main &>/dev/null; then
  BEHIND=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo "0")
  if [ "$BEHIND" -gt 0 ]; then
    warn "Local branch is $BEHIND commit(s) behind origin/main. Consider pulling first."
  fi
fi

# ──────────────────────────────────────────────────────────────
# Step 2: Determine the last release tag
# ──────────────────────────────────────────────────────────────
progress "Finding last release tag"

LAST_TAG=$(git tag --list 'v*' --sort=-v:refname | head -n 1)

if [ -z "$LAST_TAG" ]; then
  fail "No v* release tags found. Cannot compare."
  exit 1
fi

success "Last release tag: $LAST_TAG"

COMMIT_COUNT=$(git rev-list --count "$LAST_TAG"..HEAD 2>/dev/null || echo "?")
info "$COMMIT_COUNT commit(s) since $LAST_TAG"

# ──────────────────────────────────────────────────────────────
# Step 3: Prepare output directory
# ──────────────────────────────────────────────────────────────
progress "Preparing output directory"

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/baseline" "$OUTPUT_DIR/current" "$OUTPUT_DIR/diffs"
success "Created $OUTPUT_DIR/"

# ──────────────────────────────────────────────────────────────
# Step 4: Generate baseline screenshots (last release)
# ──────────────────────────────────────────────────────────────
progress "Generating baseline screenshots from $LAST_TAG"

info "Checking out $LAST_TAG..."
git checkout "$LAST_TAG" --quiet

info "Installing dependencies for $LAST_TAG..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

info "Building app..."
pnpm build

run_walkthroughs "baseline" "$OUTPUT_DIR/baseline" "$OUTPUT_DIR/baseline-results.json" "$LAST_TAG"

# ──────────────────────────────────────────────────────────────
# Step 5: Generate current screenshots
# ──────────────────────────────────────────────────────────────
progress "Generating current screenshots from $ORIGINAL_REF"

info "Checking out $ORIGINAL_REF..."
git checkout "$ORIGINAL_REF" --quiet

info "Installing dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

info "Building app..."
pnpm build

run_walkthroughs "current" "$OUTPUT_DIR/current" "$OUTPUT_DIR/current-results.json" "$ORIGINAL_REF"

# ──────────────────────────────────────────────────────────────
# Step 6: Compare screenshots
# ──────────────────────────────────────────────────────────────
progress "Comparing screenshots pixel-by-pixel"

node "$SCRIPT_DIR/compare-screenshots.cjs" "$OUTPUT_DIR"

# ──────────────────────────────────────────────────────────────
# Step 7: Open report
# ──────────────────────────────────────────────────────────────
progress "Done!"

REPORT="$OUTPUT_DIR/index.html"
if [ -f "$REPORT" ]; then
  success "Report generated: $REPORT"

  # Print summary from comparison.json
  if [ -f "$OUTPUT_DIR/comparison.json" ]; then
    node -e "
    const c = JSON.parse(require('fs').readFileSync('$OUTPUT_DIR/comparison.json', 'utf-8'));
    const { unchanged, changed, added, removed } = c.summary;
    console.log('');
    console.log('  Summary:');
    console.log('    Unchanged: ' + unchanged);
    console.log('    Changed:   ' + changed);
    console.log('    Added:     ' + added);
    console.log('    Removed:   ' + removed);
    if (c.summary.currentFailures > 0) {
      console.log('    Current test failures:  ' + c.summary.currentFailures);
    }
    "
  fi

  echo ""
  info "Opening report in browser..."
  open "$REPORT" 2>/dev/null || xdg-open "$REPORT" 2>/dev/null || echo "  Open $REPORT in your browser"
else
  fail "Report was not generated"
  exit 1
fi

echo ""
