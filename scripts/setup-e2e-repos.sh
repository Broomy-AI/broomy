#!/bin/bash
# Sets up real git repositories for E2E_REAL_REPOS tests.
# Creates repos in /tmp/broomy-e2e-* with branches, files, and commits
# that mirror the default scenario data.
set -e

TMPDIR="${TMPDIR:-/tmp}"

setup_repo() {
  local dir="$1"
  local branch="$2"
  local name="$3"

  # Clean up any previous run
  rm -rf "$dir"
  mkdir -p "$dir"
  cd "$dir"

  git init -b main
  git config user.email "test@broomy.dev"
  git config user.name "E2E Test"

  # Create initial files
  mkdir -p src
  cat > src/index.ts << 'SRCEOF'
export function main(): void {
  const result = add(2, 3)
  console.log('Result:', result)
}
SRCEOF

  cat > src/utils.ts << 'SRCEOF'
export function add(a: number, b: number): number {
  return a + b
}

export function multiply(a: number, b: number): number {
  return a * b
}
SRCEOF

  cat > package.json << 'SRCEOF'
{
  "name": "demo-project",
  "version": "1.0.0",
  "main": "src/index.ts"
}
SRCEOF

  cat > README.md << 'SRCEOF'
# Project Overview

This project provides a basic authentication system with token validation for API access.

## Getting Started

Install dependencies and run the development server.

## Architecture

The authentication middleware validates incoming requests by checking the token from the Authorization header.
SRCEOF

  git add -A
  git commit -m "Initial commit"

  # Create the feature branch if not main
  if [ "$branch" != "main" ]; then
    git checkout -b "$branch"

    # Make some changes on the feature branch
    cat > src/index.ts << 'SRCEOF'
// New comment
import { add } from './utils'

export function main(): void {
  const result = add(2, 3)
  console.log('Result:', result)
}
SRCEOF

    cat > src/new-feature.ts << 'SRCEOF'
export function newFeature(): string {
  return 'This is a new feature'
}
SRCEOF

    # Modify README
    cat >> README.md << 'SRCEOF'

## New Feature

This branch adds a new feature to the project.
SRCEOF

    git add -A
    git commit -m "Add new feature"
    git commit --allow-empty -m "Fix styling bug"
  fi

  # Create .broomy/output directory and review file
  mkdir -p .broomy/output
  cat > .broomy/output/review.md << 'REVIEWEOF'
## Overview
Add dark mode theme support with user preference persistence. Uses CSS custom properties for theming with a React context provider. Theme preference persisted in localStorage.

## Change Analysis
- [x] Reviewed file structure
- [x] Identified change patterns

### Theme context and provider
New ThemeContext and ThemeProvider for managing dark/light mode state.
[src/contexts/ThemeContext.tsx:1-25](src/contexts/ThemeContext.tsx#L1-L25)

### CSS variable updates
Updated CSS custom properties in `:root` and `[data-theme="dark"]` selectors.
[src/styles/theme.css:12-30](src/styles/theme.css#L12-L30)

## Potential Issues

### Flash of unstyled content on load
- [ ] Resolved

Theme is read from localStorage after React hydration, causing a brief flash of default theme.
Location: [src/contexts/ThemeContext.tsx:15-20](src/contexts/ThemeContext.tsx#L15-L20)

## Design Decisions

### localStorage over cookies
- [x] Reviewed

Theme preference stored in localStorage — simpler but not available server-side.
Alternatives: HTTP cookie, Server-side session
REVIEWEOF

  # Create .broomy/.gitignore
  cat > .broomy/.gitignore << 'GIEOF'
# Broomy generated files
/output/
GIEOF

  echo "  Set up $name at $dir (branch: $branch)"
}

echo "Setting up E2E test repositories..."
setup_repo "$TMPDIR/broomy-e2e-broomy" "main" "broomy"
setup_repo "$TMPDIR/broomy-e2e-backend-api" "feature/auth" "backend-api"
setup_repo "$TMPDIR/broomy-e2e-docs-site" "main" "docs-site"

# Set up demo-project repo root (used by New Session dialog)
DEMO_ROOT="$TMPDIR/broomy-e2e-repos/demo-project"
rm -rf "$DEMO_ROOT"
mkdir -p "$DEMO_ROOT/main"
cd "$DEMO_ROOT/main"
git init -b main
git config user.email "test@broomy.dev"
git config user.name "E2E Test"
mkdir -p src
echo 'export const app = true' > src/index.ts
echo '{"name": "demo-project", "version": "1.0.0"}' > package.json
echo '# Demo Project' > README.md
git add -A
git commit -m "Initial commit"

echo "Done! All E2E repos are ready."
