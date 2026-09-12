#!/usr/bin/env bash
set -euo pipefail

# Build and package Broomy for Linux.
# Injects pre-compiled node-pty native modules so we don't need to compile on Linux.
# Run scripts/build-linux-prebuilds.sh first to generate the prebuilds.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

PREBUILDS_DIR="$PROJECT_DIR/build/node-pty-prebuilds"

# Check that prebuilds exist
if [ ! -d "$PREBUILDS_DIR/linux-x64" ] || [ ! -f "$PREBUILDS_DIR/linux-x64/pty.node" ]; then
  echo "ERROR: Linux prebuilds not found."
  echo "Run: pnpm build:linux-prebuilds"
  exit 1
fi

# .deb packaging uses 'ar' which requires the Xcode license on macOS
if [[ "$OSTYPE" == darwin* ]] && ! /usr/bin/xcrun --find ar &>/dev/null; then
  echo "ERROR: Xcode license not accepted. The .deb build requires 'ar' which won't run until you agree."
  echo "Run: sudo xcodebuild -license"
  exit 1
fi

# fpm builds the .deb with whatever 'ar' is first on PATH. electron-builder's
# bundled linux-tools ships only gtar and lzip, so on macOS that resolves to
# Apple's BSD ar, which cannot write the Debian archive format: it emits a
# 96-byte stub containing just a symbol table, and exits 0. Releases up to
# v1.1.0 shipped .deb files built that way. Put GNU ar first instead.
if ! ar --version 2>/dev/null | grep -q '^GNU ar'; then
  gnu_ar_dir=""
  for candidate in /opt/homebrew/opt/binutils/bin /usr/local/opt/binutils/bin; do
    if "$candidate/ar" --version 2>/dev/null | grep -q '^GNU ar'; then
      gnu_ar_dir="$candidate"
      break
    fi
  done

  if [ -z "$gnu_ar_dir" ]; then
    echo "ERROR: GNU ar not found. Apple's ar silently produces a corrupt .deb."
    echo "Run: brew install binutils"
    exit 1
  fi

  echo "Using GNU ar from $gnu_ar_dir"
  export PATH="$gnu_ar_dir:$PATH"
fi

# Inject prebuilds into node_modules so electron-builder packages them
NODE_PTY_DIR="$PROJECT_DIR/node_modules/node-pty"

for arch in x64 arm64; do
  src="$PREBUILDS_DIR/linux-$arch"
  dest="$NODE_PTY_DIR/prebuilds/linux-$arch"

  if [ -d "$src" ]; then
    echo "Copying prebuilds: linux-$arch"
    mkdir -p "$dest"
    cp "$src"/* "$dest/"
  else
    echo "Skipping linux-$arch (no prebuilds found)"
  fi
done

# Build and package for both x64 and arm64
# Skip npmRebuild since we're providing our own native modules
pnpm build && electron-builder --linux --x64 --arm64 -c.npmRebuild=false

# A wrong 'ar' corrupts the .deb without failing the build, so confirm each one
# really is a Debian archive rather than trusting the exit code.
for deb in "$PROJECT_DIR"/dist/*.deb; do
  [ -f "$deb" ] || continue
  members=$(ar t "$deb" 2>/dev/null || true)
  for required in debian-binary control.tar data.tar; do
    if ! echo "$members" | grep -q "^$required"; then
      echo "ERROR: $(basename "$deb") is not a valid Debian package (no $required member)."
      echo "This usually means a non-GNU 'ar' was used."
      exit 1
    fi
  done
  echo "Verified $(basename "$deb")"
done
