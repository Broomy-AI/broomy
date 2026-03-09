#!/usr/bin/env bash
set -euo pipefail

# Generate an HTML report from Linux E2E screenshot test output.
#
# Usage:
#   ./generate-report.sh [output-dir]
#
# Default output-dir: ./docker-output

DIR="${1:-docker-output}"

if [ ! -d "$DIR" ]; then
  echo "ERROR: Directory '$DIR' not found. Run the E2E tests first."
  exit 1
fi

REPORT="$DIR/report.html"

# Screenshot order and metadata
KEYS="01-app-launched 02-terminal-with-output 03-session-backend-api 04-explorer-source-control 05-explorer-files-view 06-user-terminal-tab 07-new-session-dialog 08-settings-panel 09-keyboard-shortcut-explorer 10-sidebar-hidden 11-full-app-final"

get_title() {
  case "$1" in
    01-app-launched) echo "App Launch" ;;
    02-terminal-with-output) echo "Terminal I/O" ;;
    03-session-backend-api) echo "Session Switching" ;;
    04-explorer-source-control) echo "Explorer: Source Control" ;;
    05-explorer-files-view) echo "Explorer: File Tree" ;;
    06-user-terminal-tab) echo "User Terminal Tab" ;;
    07-new-session-dialog) echo "New Session Dialog" ;;
    08-settings-panel) echo "Settings Panel" ;;
    09-keyboard-shortcut-explorer) echo "Keyboard Shortcuts" ;;
    10-sidebar-hidden) echo "Sidebar Toggle" ;;
    11-full-app-final) echo "Final State" ;;
  esac
}

get_desc() {
  case "$1" in
    01-app-launched) echo "Initial app state with sidebar showing 3 demo sessions (broomy, backend-api, docs-site), branch names, status indicators, Agent tab active, and terminal canvas rendered." ;;
    02-terminal-with-output) echo "Agent terminal showing full fake-claude output sequence (READY, thinking, analyzing, generating, IDLE) and echoed LINUX_TEST_OK confirming input/output works." ;;
    03-session-backend-api) echo "Switched to backend-api session. Title bar updated, session highlighted in sidebar, different terminal content displayed." ;;
    04-explorer-source-control) echo "Explorer panel open with Uncommitted view showing staged/unstaged changes, Commit and Commit with AI buttons, and changed file list." ;;
    05-explorer-files-view) echo "Explorer switched to Files view showing directory tree with src/ folder and package.json." ;;
    06-user-terminal-tab) echo "New user terminal tab created and active, showing test-shell prompt. Demonstrates tab creation and switching away from Agent terminal." ;;
    07-new-session-dialog) echo "New Session dialog with Clone, Add Repo, and Folder action buttons. Lists demo-project repo with branch creation and selection options." ;;
    08-settings-panel) echo "Settings panel showing General config (Default Repo Folder, Terminal Shell), Agents section, and Repositories list." ;;
    09-keyboard-shortcut-explorer) echo "Explorer panel toggled open via Meta+2 keyboard shortcut, confirming keybindings work on Linux." ;;
    10-sidebar-hidden) echo "Sidebar hidden via Sessions button toggle. Terminal takes full width. Confirms panel visibility toggling works." ;;
    11-full-app-final) echo "Clean full-app view after all tests. Broomy session selected, Agent tab active, terminal content preserved throughout the test run." ;;
  esac
}

# Count passing tests from log
TEST_LOG="$DIR/test-output.log"
PASS_COUNT=""
if [ -f "$TEST_LOG" ]; then
  PASS_COUNT=$(grep -c '✓' "$TEST_LOG" 2>/dev/null || echo "")
fi

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Build HTML
cat > "$REPORT" << HEADER
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Broomy Linux E2E Report</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; line-height: 1.5; }
  .header { padding: 2rem; text-align: center; border-bottom: 1px solid #21262d; }
  .header h1 { font-size: 1.8rem; color: #58a6ff; margin-bottom: 0.5rem; }
  .header .meta { color: #8b949e; font-size: 0.9rem; }
  .header .badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 1rem; font-size: 0.85rem; font-weight: 600; margin-top: 0.5rem; }
  .badge-pass { background: #238636; color: #fff; }
  .container { max-width: 1200px; margin: 0 auto; padding: 1rem 2rem 3rem; }
  .card { background: #161b22; border: 1px solid #21262d; border-radius: 0.5rem; margin-bottom: 2rem; overflow: hidden; }
  .card-header { padding: 1rem 1.25rem; border-bottom: 1px solid #21262d; display: flex; align-items: baseline; gap: 0.75rem; }
  .card-header .num { color: #58a6ff; font-weight: 700; font-size: 0.85rem; min-width: 1.5rem; }
  .card-header h2 { font-size: 1.1rem; color: #e6edf3; }
  .card-body { padding: 1rem 1.25rem; }
  .card-body p { color: #8b949e; font-size: 0.9rem; margin-bottom: 1rem; }
  .card-body img { width: 100%; border-radius: 0.375rem; border: 1px solid #30363d; cursor: pointer; transition: transform 0.2s; }
  .card-body img:hover { transform: scale(1.01); }
  .toc { background: #161b22; border: 1px solid #21262d; border-radius: 0.5rem; padding: 1.25rem; margin-bottom: 2rem; }
  .toc h3 { color: #e6edf3; margin-bottom: 0.75rem; font-size: 1rem; }
  .toc ol { padding-left: 1.5rem; }
  .toc li { margin-bottom: 0.25rem; }
  .toc a { color: #58a6ff; text-decoration: none; font-size: 0.9rem; }
  .toc a:hover { text-decoration: underline; }
  .lightbox { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 100; justify-content: center; align-items: center; cursor: zoom-out; }
  .lightbox.active { display: flex; }
  .lightbox img { max-width: 95vw; max-height: 95vh; border-radius: 0.5rem; }
</style>
</head>
<body>
<div class="header">
  <h1>Broomy Linux E2E Screenshot Report</h1>
  <div class="meta">Generated: $TIMESTAMP</div>
HEADER

if [ -n "$PASS_COUNT" ]; then
  echo "  <span class=\"badge badge-pass\">$PASS_COUNT tests passed</span>" >> "$REPORT"
fi

cat >> "$REPORT" << 'TOC_START'
</div>
<div class="container">
<div class="toc">
<h3>Screenshots</h3>
<ol>
TOC_START

# TOC
for key in $KEYS; do
  if [ -f "$DIR/$key.png" ]; then
    title=$(get_title "$key")
    echo "  <li><a href=\"#$key\">$title</a></li>" >> "$REPORT"
  fi
done

echo "</ol></div>" >> "$REPORT"

# Cards with embedded base64 images
for key in $KEYS; do
  PNG="$DIR/$key.png"
  if [ ! -f "$PNG" ]; then
    continue
  fi
  title=$(get_title "$key")
  desc=$(get_desc "$key")
  num="${key%%-*}"
  B64=$(base64 -i "$PNG" | tr -d '\n')
  cat >> "$REPORT" << CARD
<div class="card" id="$key">
  <div class="card-header">
    <span class="num">#$num</span>
    <h2>$title</h2>
  </div>
  <div class="card-body">
    <p>$desc</p>
    <img src="data:image/png;base64,$B64" alt="$title" onclick="openLightbox(this.src)">
  </div>
</div>
CARD
done

cat >> "$REPORT" << 'FOOTER'
</div>
<div class="lightbox" id="lightbox" onclick="closeLightbox()">
  <img id="lightbox-img" src="" alt="Enlarged screenshot">
</div>
<script>
function openLightbox(src) {
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox').classList.add('active');
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('active');
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });
</script>
</body>
</html>
FOOTER

echo "Report generated: $REPORT"

# Open on macOS if available
if command -v open &>/dev/null; then
  open "$REPORT"
fi
