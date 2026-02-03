#!/bin/bash
# Claude Code hook script for Agent Manager
# This script is called by Claude Code at various events
# It writes events to a JSONL file that Agent Manager monitors
#
# IMPORTANT: This hook only activates when AGENT_MANAGER_SESSION_ID is set.
# When you run Claude Code normally (not from Agent Manager), this hook
# does nothing and exits immediately.

# Check if we're running from Agent Manager
# If not, exit silently - don't interfere with normal Claude usage
if [ -z "$AGENT_MANAGER_SESSION_ID" ]; then
  exit 0
fi

# Event type is passed as first argument
EVENT_TYPE="$1"

# Session ID from environment (set when launching Claude from Agent Manager)
SESSION_ID="$AGENT_MANAGER_SESSION_ID"

# Event directory
EVENT_DIR="$HOME/.agent-manager/hooks-events"
EVENT_FILE="$EVENT_DIR/$SESSION_ID.jsonl"

# Ensure directory exists
mkdir -p "$EVENT_DIR"

# Read JSON input from stdin
INPUT=$(cat)

# Get tool name from input if present
TOOL_NAME=$(echo "$INPUT" | grep -o '"tool_name":"[^"]*"' | cut -d'"' -f4 2>/dev/null || echo "")

# Create timestamp (milliseconds since epoch)
# macOS doesn't support %N, so we use perl or python as fallback
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS: use perl for millisecond precision
  TIMESTAMP=$(perl -MTime::HiRes=time -e 'printf "%.0f\n", time * 1000' 2>/dev/null || echo $(($(date +%s) * 1000)))
else
  # Linux: date supports %N for nanoseconds
  TIMESTAMP=$(date +%s%3N)
fi

# Build event JSON
case "$EVENT_TYPE" in
  "PreToolUse")
    echo "{\"type\":\"PreToolUse\",\"timestamp\":$TIMESTAMP,\"sessionId\":\"$SESSION_ID\",\"data\":{\"tool\":\"$TOOL_NAME\"}}" >> "$EVENT_FILE"
    ;;
  "PostToolUse")
    echo "{\"type\":\"PostToolUse\",\"timestamp\":$TIMESTAMP,\"sessionId\":\"$SESSION_ID\",\"data\":{\"tool\":\"$TOOL_NAME\"}}" >> "$EVENT_FILE"
    ;;
  "PermissionRequest")
    # Claude is requesting permission for a tool - waiting for user approval
    echo "{\"type\":\"PermissionRequest\",\"timestamp\":$TIMESTAMP,\"sessionId\":\"$SESSION_ID\",\"data\":{\"tool\":\"$TOOL_NAME\"}}" >> "$EVENT_FILE"
    ;;
  "Stop")
    echo "{\"type\":\"Stop\",\"timestamp\":$TIMESTAMP,\"sessionId\":\"$SESSION_ID\",\"data\":{}}" >> "$EVENT_FILE"
    ;;
  *)
    # Other events we might want to track
    echo "{\"type\":\"$EVENT_TYPE\",\"timestamp\":$TIMESTAMP,\"sessionId\":\"$SESSION_ID\",\"data\":{}}" >> "$EVENT_FILE"
    ;;
esac

# Always exit successfully - we don't want to block Claude
exit 0
