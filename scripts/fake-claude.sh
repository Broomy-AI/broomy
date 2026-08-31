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

# Claude Code prints file "chips" as OSC 8 hyperlinks (#164) rather than plain text: the link is
# attached to the terminal CELLS, so it survives the hard wrap a long chip path almost always hits.
# Emitted here as the real escape sequence (ESC ] 8 ; ; <uri> ST <label> ESC ] 8 ; ; ST) so the
# walkthrough and the dev-mode demo exercise exactly the path a real agent takes.
printf '\e]8;;file:///tmp/broomy-preview.html\e\\[file]/tmp/broomy-preview.html (1.2KB)\e]8;;\e\\\n'

# A chip whose LABEL disagrees with its URI. Terminal output is untrusted — an OSC 8 label is
# arbitrary text and need not describe where the link goes — so the hover hint has to spell the real
# target out. This deliberately deceptive chip is what proves it (#164 anti-spoofing).
printf '\e]8;;file:///tmp/broomy-preview.html\e\\[image]/tmp/holiday-photo.png (495.3KB)\e]8;;\e\\\n'
echo ""

# Now go idle (stop outputting)
# After 3 seconds of no output, the status should show "idle"
echo "FAKE_CLAUDE_IDLE"

# Keep the script running but idle
sleep 999999
