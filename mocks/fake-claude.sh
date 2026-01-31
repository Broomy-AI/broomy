#!/bin/bash
# Fake Claude CLI for testing
# Simulates Claude Code behavior patterns

echo "╭─────────────────────────────────────────╮"
echo "│           Claude Code (mock)            │"
echo "╰─────────────────────────────────────────╯"
echo ""
echo "  Working directory: $(pwd)"
echo ""

while true; do
    # Show prompt (this indicates "waiting" state)
    echo -n "> "
    read -r input

    if [ -z "$input" ]; then
        continue
    fi

    case "$input" in
        "exit"|"quit")
            echo "Goodbye!"
            exit 0
            ;;
        "status")
            echo "Mock Claude is running in test mode."
            ;;
        "work")
            # Simulate working state
            echo "Working on your request..."
            for i in {1..5}; do
                sleep 0.5
                echo "  Processing step $i..."
            done
            echo "Done!"
            ;;
        "error")
            echo "Error: Something went wrong (simulated error)"
            ;;
        "ask")
            # Simulate waiting for input state
            echo "I have a question for you:"
            echo "Do you want me to proceed? [y/n]"
            read -r answer
            echo "You answered: $answer"
            ;;
        *)
            echo "You said: $input"
            echo "(Mock Claude echoing input)"
            ;;
    esac
done
