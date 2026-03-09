#!/usr/bin/env bash
set -euo pipefail

# Run Broomy E2E tests in a Linux Docker container.
#
# Usage:
#   ./run-linux-e2e.sh                  # Run all E2E tests
#   ./run-linux-e2e.sh screenshots      # Run screenshot-only tests
#   ./run-linux-e2e.sh --shell          # Drop into container for debugging
#   ./run-linux-e2e.sh --no-build       # Skip Docker build, reuse existing image
#
# Output (screenshots, reports, logs) goes to ./docker-output/

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

IMAGE_NAME="broomy-linux-e2e"
OUTPUT_DIR="$SCRIPT_DIR/docker-output"

# Parse flags
SKIP_BUILD=false
MODE="test"

for arg in "$@"; do
  case "$arg" in
    --no-build)
      SKIP_BUILD=true
      ;;
    --shell)
      MODE="shell"
      ;;
    screenshots)
      MODE="screenshots"
      ;;
    *)
      MODE="$arg"
      ;;
  esac
done

# Build the Docker image
if [ "$SKIP_BUILD" = false ]; then
  echo ""
  echo "=== Building Docker image: $IMAGE_NAME ==="
  echo ""
  docker build -t "$IMAGE_NAME" .
fi

# Prepare output directory
mkdir -p "$OUTPUT_DIR"

echo ""
echo "=== Running: $MODE ==="
echo "=== Output dir: $OUTPUT_DIR ==="
echo ""

DOCKER_FLAGS=(
  --rm
  -v "$OUTPUT_DIR:/output"
  # Electron needs these for GPU/sandbox
  --shm-size=2g
  --security-opt seccomp=unconfined
)

if [ "$MODE" = "shell" ]; then
  # Interactive mode
  docker run -it "${DOCKER_FLAGS[@]}" "$IMAGE_NAME" shell
else
  # Non-interactive test run
  docker run "${DOCKER_FLAGS[@]}" "$IMAGE_NAME" "$MODE"
  EXIT_CODE=$?

  echo ""
  if [ $EXIT_CODE -eq 0 ]; then
    echo "=== All tests passed ==="
  else
    echo "=== Tests failed (exit code: $EXIT_CODE) ==="
  fi
  echo "=== Output saved to: $OUTPUT_DIR ==="

  # List screenshots if any
  SCREENSHOTS=$(find "$OUTPUT_DIR" -name "*.png" 2>/dev/null)
  if [ -n "$SCREENSHOTS" ]; then
    echo ""
    echo "Screenshots:"
    echo "$SCREENSHOTS" | while read -r f; do echo "  $f"; done
  fi

  exit $EXIT_CODE
fi
