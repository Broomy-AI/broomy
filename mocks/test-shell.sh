#!/bin/bash
# Non-interactive mock shell for E2E tests
# Outputs predictable content that tests can verify

# Print a welcome message
echo "╭─────────────────────────────────────────╮"
echo "│         Test Shell (E2E Mock)          │"
echo "╰─────────────────────────────────────────╯"
echo ""
echo "Working directory: $(pwd)"
echo ""

# Simulate shell prompt
echo -n "test-shell$ "

# Read commands from stdin (if any)
# Use a timeout so the shell doesn't block forever
while IFS= read -r -t 30 line; do
    case "$line" in
        "echo "*)
            # Handle echo commands
            ${line}
            ;;
        "exit"|"quit")
            echo "Goodbye!"
            exit 0
            ;;
        "simulate-working")
            echo "Starting work..."
            sleep 0.5
            echo "Processing step 1..."
            sleep 0.5
            echo "Processing step 2..."
            sleep 0.5
            echo "Done!"
            ;;
        "simulate-waiting")
            echo "I have a question:"
            echo "Do you want to continue? [y/n]"
            ;;
        "simulate-error")
            echo "Error: Something went wrong!" >&2
            ;;
        *)
            # Echo back the command
            if [ -n "$line" ]; then
                echo "Received: $line"
            fi
            ;;
    esac
    echo -n "test-shell$ "
done

# If we get here, timeout was reached
echo ""
echo "[Shell timed out after 30s]"
exit 0
