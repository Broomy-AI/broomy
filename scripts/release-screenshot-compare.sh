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

# Run all feature walkthroughs in a single Playwright invocation,
# then copy screenshots to the target directory.
# Args: $1 = label (e.g. "baseline"), $2 = target dir, $3 = results json path
#        $4 = ref label, $5... = feature names to run
run_walkthroughs() {
  # Disable set -e inside this function — we handle all errors explicitly
  # and need to tolerate test failures without aborting.
  set +e

  local label="$1"
  local target_dir="$2"
  local results_json="$3"
  local ref_label="$4"
  shift 4
  local features_to_run=("$@")
  local feature_count=${#features_to_run[@]}

  # Clean all existing screenshots before running
  for feature in "${features_to_run[@]}"; do
    rm -rf "$FEATURES_DIR/$feature/screenshots"
  done

  # Build test paths — only include features that have spec files at this checkout
  local test_paths=()
  local skipped_features=()
  for feature in "${features_to_run[@]}"; do
    local spec_files
    spec_files=$(find "$FEATURES_DIR/$feature" -name '*.spec.ts' 2>/dev/null | head -1 || true)
    if [ -n "$spec_files" ]; then
      test_paths+=("tests/features/$feature/")
    else
      skipped_features+=("$feature")
    fi
  done

  local runnable_count=${#test_paths[@]}
  local skipped_count=${#skipped_features[@]}
  local skipped_csv=""
  if [ "$skipped_count" -gt 0 ]; then
    skipped_csv=$(IFS=,; echo "${skipped_features[*]}")
    warn "Skipping $skipped_count feature(s) not present at $ref_label: ${skipped_features[*]}"
  fi

  if [ "$runnable_count" -eq 0 ]; then
    warn "No runnable feature walkthroughs at $ref_label"
    # Write empty results JSON
    node -e "
const fs = require('fs');
fs.writeFileSync(process.argv[1], JSON.stringify({
  ref: process.argv[2], passed: 0, failed: 0,
  skipped: parseInt(process.argv[3]),
  skippedFeatures: process.argv[4].split(',').filter(Boolean),
  failedFeatures: [], errors: ''
}, null, 2));
" "$results_json" "$ref_label" "$skipped_count" "$skipped_csv"
    return
  fi

  info "Running $runnable_count feature walkthrough(s) in one batch..."

  local output_file
  output_file=$(mktemp)
  local exit_code=0

  # Run all features in a single Playwright invocation.
  # Redirect to file instead of tee to avoid pipe keeping processes alive on timeout.
  npx playwright test --config playwright.features.config.ts "${test_paths[@]}" > "$output_file" 2>&1 || exit_code=$?

  # Show a condensed summary of what Playwright reported
  grep -E '^\s*(✓|✘|-)' "$output_file" | tail -20 || true

  # Collect screenshots and determine per-feature pass/fail from output
  local passed=0
  local failed=0
  local failed_features=()

  for feature in "${features_to_run[@]}"; do
    # Check if this feature was skipped (not present at this ref)
    local was_skipped=false
    for sf in ${skipped_features[@]+"${skipped_features[@]}"}; do
      if [ "$sf" = "$feature" ]; then
        was_skipped=true
        break
      fi
    done
    if [ "$was_skipped" = true ]; then
      continue
    fi

    if [ -d "$FEATURES_DIR/$feature/screenshots" ]; then
      # Feature produced screenshots — it passed
      mkdir -p "$target_dir/$feature"
      cp "$FEATURES_DIR/$feature/screenshots/"*.png "$target_dir/$feature/" 2>/dev/null || true
      local count
      count=$(ls "$target_dir/$feature/"*.png 2>/dev/null | wc -l | tr -d ' ')
      success "$feature — $count screenshot(s)"
      passed=$((passed + 1))
    else
      # No screenshots — it failed
      fail "$feature — no screenshots (test failed)"
      failed=$((failed + 1))
      failed_features+=("$feature")
    fi

    # Clean up screenshots from tests/features/ so they don't get committed
    rm -rf "$FEATURES_DIR/$feature/screenshots"
  done

  # Also clean up any generated HTML in tests/features/ (gitignored but still messy)
  for feature in "${features_to_run[@]}"; do
    rm -f "$FEATURES_DIR/$feature/index.html"
  done
  rm -f "$FEATURES_DIR/index.html"

  # Write results JSON — use a temp file to pass error text safely (avoids
  # shell-escaping issues with Playwright output containing backticks, $, etc.)
  local errors_file
  errors_file=$(mktemp)
  if [ $failed -gt 0 ]; then
    cp "$output_file" "$errors_file"
  fi
  rm -f "$output_file"

  local failed_csv=""
  if [ ${#failed_features[@]} -gt 0 ]; then
    failed_csv=$(IFS=,; echo "${failed_features[*]}")
  fi

  node -e "
const fs = require('fs');
const errorsText = fs.readFileSync(process.argv[5], 'utf-8');
const results = {
  ref: process.argv[1],
  passed: parseInt(process.argv[2]),
  failed: parseInt(process.argv[3]),
  skipped: parseInt(process.argv[7]),
  failedFeatures: process.argv[4].split(',').filter(Boolean),
  skippedFeatures: process.argv[8].split(',').filter(Boolean),
  errors: errorsText
};
fs.writeFileSync(process.argv[6], JSON.stringify(results, null, 2));
" "$ref_label" "$passed" "$failed" "$failed_csv" "$errors_file" "$results_json" "$skipped_count" "$skipped_csv"

  rm -f "$errors_file"

  echo ""
  if [ $failed -eq 0 ] && [ $skipped_count -eq 0 ]; then
    success "All $passed walkthroughs passed"
  elif [ $failed -eq 0 ]; then
    success "$passed passed, $skipped_count skipped (not present at $ref_label)"
  else
    warn "$passed passed, $failed failed, $skipped_count skipped"
  fi

  # Re-enable set -e for the rest of the script
  set -e
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

# List available features (from current branch, before checkout)
FEATURES=()
for dir in "$FEATURES_DIR"/*/; do
  name=$(basename "$dir")
  if [ "$name" != "_shared" ]; then
    FEATURES+=("$name")
  fi
done

FEATURE_COUNT=${#FEATURES[@]}
info "Found $FEATURE_COUNT feature walkthroughs to run"

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

run_walkthroughs "baseline" "$OUTPUT_DIR/baseline" "$OUTPUT_DIR/baseline-results.json" "$LAST_TAG" "${FEATURES[@]}"

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

run_walkthroughs "current" "$OUTPUT_DIR/current" "$OUTPUT_DIR/current-results.json" "$ORIGINAL_REF" "${FEATURES[@]}"

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
    if (c.summary.baselineSkipped > 0) {
      console.log('    New features (no baseline): ' + c.summary.baselineSkipped);
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
