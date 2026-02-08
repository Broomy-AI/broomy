#!/bin/bash
# Fake Claude simulator that outputs a large plan
# Used by terminal-scrolling E2E tests to stress-test scroll behavior

# Show ready marker
echo "FAKE_CLAUDE_READY"

# Wait for terminal to initialize
sleep 0.5

echo ""
echo "I'll help you implement that feature. Let me create a plan."
echo ""

# Brief pause to establish "at bottom" state before the flood
sleep 0.5

# Output a large plan all at once - this simulates Claude dumping a plan,
# which is the scenario that triggers scrolling issues.
# The key is that ~90 lines arrive rapidly when the terminal only shows ~30 rows,
# forcing content into scrollback.
echo "PLAN_OUTPUT_START"
echo ""
echo "╭────────────────────────────────────────────────────────────────────╮"
echo "│                        Implementation Plan                        │"
echo "├────────────────────────────────────────────────────────────────────┤"
for i in $(seq 1 80); do
    printf "│  Step %2d: Implement feature component %-27s │\n" "$i" "part-$i"
done
echo "├────────────────────────────────────────────────────────────────────┤"
echo "│  Summary: 80 steps to complete the implementation                 │"
echo "│  Estimated files to modify: 15                                    │"
echo "│  New files to create: 8                                           │"
echo "╰────────────────────────────────────────────────────────────────────╯"
echo ""
echo "PLAN_OUTPUT_END"
echo ""

# Brief pause then go idle
sleep 0.3
echo "FAKE_CLAUDE_IDLE"

# Keep running
sleep 999999
