#!/bin/bash
# Fake Claude with realistic ANSI sequences
# Tests scroll behavior with cursor movement, line clearing, color codes,
# and the pattern of spinner-then-large-output that Claude Code uses

echo "FAKE_CLAUDE_READY"
sleep 0.3

# Phase 1: Spinner updates using \r (carriage return)
# This is what Claude Code does while thinking - it overwrites the same line
for i in $(seq 1 30); do
    printf "\r\033[K⠋ Thinking... (%d/30)" "$i"
    sleep 0.05
done
printf "\r\033[K✓ Done thinking\n"

sleep 0.2

# Phase 2: Output with color codes and box drawing (like Claude's formatted output)
printf "\033[1;34m"  # Bold blue
echo "╭──────────────────────────────────────────────────────────────────╮"
echo "│                        Implementation Plan                      │"
echo "├──────────────────────────────────────────────────────────────────┤"
printf "\033[0m"  # Reset

# Phase 3: Large block output with ANSI colors - output as fast as possible
# Build the entire plan as a single string and output it all at once
PLAN=""
for i in $(seq 1 100); do
    PLAN+="$(printf '\033[32m│\033[0m  Step %2d: \033[33mImplement\033[0m feature component part-%d with \033[36mdetailed description\033[0m  \033[32m│\033[0m\n' "$i" "$i")"
done
PLAN+="$(printf '\033[1;34m├──────────────────────────────────────────────────────────────────┤\033[0m\n')"
PLAN+="$(printf '\033[1;34m│\033[0m  Summary: 100 steps, 15 files to modify, 8 new files          \033[1;34m│\033[0m\n')"
PLAN+="$(printf '\033[1;34m╰──────────────────────────────────────────────────────────────────╯\033[0m\n')"

# Output the entire plan in one write
printf "%s" "$PLAN"

echo ""
echo "PLAN_OUTPUT_END"

# Phase 4: Another spinner (simulates Claude working on the plan)
sleep 0.3
for i in $(seq 1 20); do
    printf "\r\033[K⠋ Implementing step %d..." "$i"
    sleep 0.05
done
printf "\r\033[K✓ Implementation complete\n"

echo ""
echo "FAKE_CLAUDE_IDLE"
sleep 999999
