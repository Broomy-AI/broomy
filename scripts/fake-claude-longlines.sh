#!/bin/bash
# Fake Claude with long wrapping lines and width-change-sensitive content
# Long lines wrap differently at different terminal widths, which triggers
# xterm reflow and is the most likely cause of scroll desyncs

echo "FAKE_CLAUDE_READY"
sleep 0.5

# Output many long lines that will wrap at typical terminal widths
# These are ~200 chars each, so at 80 cols they wrap to ~3 lines each
# At 60 cols they wrap to ~4 lines each
# This means a width change causes massive reflow changes
for i in $(seq 1 50); do
    echo "Step $i: This is a very long line that describes a detailed implementation step with lots of context about what needs to be done, including specific file paths like src/renderer/components/Terminal.tsx and function names like handleScrollToBottom and other details that make this line very long so it wraps multiple times in the terminal"
done

echo ""
echo "PLAN_OUTPUT_END"
sleep 0.3
echo "FAKE_CLAUDE_IDLE"
sleep 999999
