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
echo ""

# Now go idle (stop outputting)
# After 3 seconds of no output, the status should show "idle"
echo "FAKE_CLAUDE_IDLE"

# Keep the script running but idle
sleep 999999
