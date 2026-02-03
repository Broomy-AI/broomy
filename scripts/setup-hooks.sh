#!/bin/bash
# Setup script to configure Claude Code hooks for Agent Manager
# Run this once to enable hooks integration

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK_SCRIPT="$SCRIPT_DIR/claude-hook.sh"
SETTINGS_FILE="$HOME/.claude/settings.json"
BACKUP_FILE="$HOME/.claude/settings.json.backup"

echo "Setting up Claude Code hooks for Agent Manager..."
echo ""

# Ensure hook script is executable
chmod +x "$HOOK_SCRIPT"

# Check if settings file exists
if [ ! -f "$SETTINGS_FILE" ]; then
  echo "Error: Claude Code settings file not found at $SETTINGS_FILE"
  echo "Please ensure Claude Code is installed and has been run at least once."
  exit 1
fi

# Backup existing settings
cp "$SETTINGS_FILE" "$BACKUP_FILE"
echo "Backed up settings to $BACKUP_FILE"

# Create the hooks configuration (new format with matcher)
HOOKS_CONFIG=$(cat << EOF
  "hooks": {
    "PreToolUse": [{"matcher": "*", "hooks": [{"type": "command", "command": "$HOOK_SCRIPT PreToolUse"}]}],
    "PostToolUse": [{"matcher": "*", "hooks": [{"type": "command", "command": "$HOOK_SCRIPT PostToolUse"}]}],
    "PermissionRequest": [{"matcher": "*", "hooks": [{"type": "command", "command": "$HOOK_SCRIPT PermissionRequest"}]}],
    "Stop": [{"matcher": "*", "hooks": [{"type": "command", "command": "$HOOK_SCRIPT Stop"}]}]
  }
EOF
)

# Check if hooks already exist in settings
if grep -q '"hooks"' "$SETTINGS_FILE"; then
  echo "Hooks section already exists in settings.json"
  echo ""
  echo "Please manually update your hooks configuration to include:"
  echo ""
  echo "$HOOKS_CONFIG"
  echo ""
  echo "Or remove the existing hooks section and run this script again."
  exit 0
fi

# Add hooks to settings.json using Python for reliable JSON manipulation
python3 << EOF
import json
import sys

settings_file = "$SETTINGS_FILE"
hook_script = "$HOOK_SCRIPT"

try:
    with open(settings_file, 'r') as f:
        settings = json.load(f)
except Exception as e:
    print(f"Error reading settings: {e}")
    sys.exit(1)

# New hooks format requires matcher (string) and hooks array
# Example: {"PostToolUse": [{"matcher": "*", "hooks": [{"type": "command", "command": "..."}]}]}
def make_hook_entry(event_type):
    return {
        'matcher': '*',  # Match all
        'hooks': [
            {
                'type': 'command',
                'command': f'{hook_script} {event_type}'
            }
        ]
    }

# Add hooks configuration
if 'hooks' not in settings:
    settings['hooks'] = {}

settings['hooks']['PreToolUse'] = [make_hook_entry('PreToolUse')]
settings['hooks']['PostToolUse'] = [make_hook_entry('PostToolUse')]
settings['hooks']['PermissionRequest'] = [make_hook_entry('PermissionRequest')]
settings['hooks']['Stop'] = [make_hook_entry('Stop')]

try:
    with open(settings_file, 'w') as f:
        json.dump(settings, f, indent=2)
    print("Hooks configuration added successfully!")
except Exception as e:
    print(f"Error writing settings: {e}")
    sys.exit(1)
EOF

echo ""
echo "Claude Code hooks configured successfully!"
echo ""
echo "The following hooks are now active:"
echo "  - PreToolUse: Track when Claude starts using a tool"
echo "  - PostToolUse: Track when Claude finishes using a tool"
echo "  - Stop: Track when Claude stops"
echo ""
echo "IMPORTANT: These hooks ONLY activate when Claude is launched from"
echo "Agent Manager. When you run Claude normally from the terminal,"
echo "the hooks do nothing and exit immediately."
echo ""
echo "Restart Claude Code for changes to take effect."
