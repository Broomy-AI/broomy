#!/usr/bin/env bash
set -euo pipefail

# Start Xvfb virtual display
echo "Starting Xvfb on display :99 (1920x1080x24)..."
Xvfb :99 -screen 0 1920x1080x24 -ac &
XVFB_PID=$!

# Wait for Xvfb to be ready
sleep 1
if ! kill -0 $XVFB_PID 2>/dev/null; then
  echo "ERROR: Xvfb failed to start"
  exit 1
fi
echo "Xvfb ready (PID $XVFB_PID)"

cleanup() {
  echo "Stopping Xvfb..."
  kill $XVFB_PID 2>/dev/null || true
}
trap cleanup EXIT

export DOCKER=true

# App is pre-built during docker build — tell global-setup to skip rebuilding
export E2E_SKIP_BUILD=true

case "${1:-test}" in
  test)
    echo ""
    echo "=== Running E2E tests ==="
    echo ""

    # Phase 1: Run all standard E2E tests
    npx playwright test --reporter=list 2>&1 | tee /output/test-output.log
    E2E_EXIT=${PIPESTATUS[0]}

    # Phase 2: Run screenshot validation tests
    echo ""
    echo "=== Running screenshot validation tests ==="
    echo ""
    GENERATE_SCREENSHOTS=true SCREENSHOT_DIR=/output npx playwright test tests/docker-isolation.spec.ts --reporter=list 2>&1 | tee -a /output/test-output.log
    SCREENSHOT_EXIT=${PIPESTATUS[0]}

    # Copy any generated artifacts to output
    if [ -d test-results ]; then
      cp -r test-results /output/ 2>/dev/null || true
    fi
    if [ -d playwright-report ]; then
      cp -r playwright-report /output/ 2>/dev/null || true
    fi

    # Report results
    echo ""
    if [ $E2E_EXIT -eq 0 ] && [ $SCREENSHOT_EXIT -eq 0 ]; then
      echo "=== All tests passed ==="
    else
      [ $E2E_EXIT -ne 0 ] && echo "=== E2E tests failed (exit code: $E2E_EXIT) ==="
      [ $SCREENSHOT_EXIT -ne 0 ] && echo "=== Screenshot tests failed (exit code: $SCREENSHOT_EXIT) ==="
    fi

    # Exit with failure if either suite failed
    if [ $E2E_EXIT -ne 0 ]; then
      exit $E2E_EXIT
    fi
    exit $SCREENSHOT_EXIT
    ;;

  screenshots)
    echo ""
    echo "=== Running screenshot tests ==="
    echo ""
    # Run the docker-isolation spec which takes screenshots of all key features
    GENERATE_SCREENSHOTS=true SCREENSHOT_DIR=/output npx playwright test tests/docker-isolation.spec.ts --reporter=list 2>&1 | tee /output/test-output.log
    EXIT_CODE=${PIPESTATUS[0]}

    # Copy screenshots to output
    if [ -d test-results ]; then
      cp -r test-results /output/ 2>/dev/null || true
    fi

    echo ""
    echo "=== Screenshots finished (exit code: $EXIT_CODE) ==="
    echo "Screenshots saved to /output/"
    exit $EXIT_CODE
    ;;

  shell)
    echo ""
    echo "=== Interactive shell ==="
    echo "  Display: $DISPLAY"
    echo "  App built in: /app/out/"
    echo "  Run tests:  npx playwright test --reporter=list"
    echo "  Run app:    npx electron out/main/index.js"
    echo ""
    exec /bin/bash
    ;;

  *)
    exec "$@"
    ;;
esac
