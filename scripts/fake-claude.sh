#!/bin/bash
# Fake Claude simulator for E2E tests
# Automatically outputs Claude-like terminal activity to test status detection

# Spinner characters that Claude uses (both styles)
SPINNER_CHARS=("." "+" "*" "⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")

# Function to simulate a spinner animation
simulate_spinner() {
    local duration=$1
    local message=$2
    local end=$((SECONDS + duration))
    local i=0

    while [ $SECONDS -lt $end ]; do
        printf "\r%s %s" "${SPINNER_CHARS[$i]}" "$message"
        i=$(( (i + 1) % ${#SPINNER_CHARS[@]} ))
        sleep 0.1
    done
    printf "\r✓ %s\n" "$message"
}

# Show the original command that was requested (for E2E testing of command flags)
if [ -n "$BROOMY_ORIGINAL_COMMAND" ]; then
  echo "BROOMY_COMMAND=$BROOMY_ORIGINAL_COMMAND"
fi

# Show ready marker
echo "FAKE_CLAUDE_READY"

# Wait a moment for the terminal to be ready
sleep 0.3

# Simulate Claude working on a task
echo ""
echo "╭──────────────────────────────────────────╮"
echo "│  Claude is thinking...                   │"
echo "╰──────────────────────────────────────────╯"

simulate_spinner 2 "Analyzing request..."
sleep 0.2
simulate_spinner 1 "Reading files..."
sleep 0.2
simulate_spinner 1 "Generating response..."

echo ""
echo "Done! This is a simulated Claude response."
echo "View the PR at https://github.com/Broomy-AI/broomy/pull/149"
# Actually write the file before announcing it: file-path links are existence-gated (#153), so a
# path to a file that was never created is deliberately NOT linkified — the dev-mode demo and the
# feature-doc screenshot would both show plain text and quietly misrepresent the feature.
printf '<h1>Broomy preview</h1>\n' > /tmp/broomy-preview.html
echo "Wrote the design doc to /tmp/broomy-preview.html"
echo ""

# Now go idle (stop outputting)
# After 3 seconds of no output, the status should show "idle"
echo "FAKE_CLAUDE_IDLE"

# Keep the script running but idle
sleep 999999
