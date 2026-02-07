# Broomy Website

Marketing website for Broomy. Built with Next.js 14, React, Tailwind CSS v4, and TypeScript.

## Development

```bash
# From the repo root:
pnpm website        # Start dev server

# Or from this directory:
pnpm dev            # Start dev server
pnpm build          # Production build (static export to out/)
```

## Screenshots

The site needs 6 screenshots placed in `public/screenshots/`. These are committed to the repo and served as static assets.

### Capture specs

- **Resolution**: 2x Retina. Capture at **2800x1800**, displayed at 1400x900.
- **Format**: PNG
- **Window chrome**: Include the macOS title bar (Electron window frame).
- **No annotations or overlays** — show the real app as-is.

### Required screenshots

| Filename | What to show | Notes |
|----------|-------------|-------|
| `hero.png` | Full app window with an agent working, Explorer panel open, sidebar showing multiple sessions | This is the main hero image — make it look busy and real. Show at least 3 sessions with mixed status (working/idle). |
| `sidebar.png` | Sidebar with 3+ sessions showing different status indicators (working, idle, unread), branch names visible | Can be a crop or full window with sidebar prominent. |
| `status.png` | A session in "Working" state with spinner visible in the terminal, showing tool use output (Read/Write/Edit) | Focus on the terminal area so the activity detection is clear. |
| `explorer.png` | Explorer panel open showing file tree with git status badges (M, A, D) and the source control view with staged/unstaged files | Show a repo with real-looking changes. |
| `diff.png` | File viewer showing a side-by-side diff in the Monaco editor | Pick a diff with enough context to show syntax highlighting. |
| `settings.png` | Settings or new session dialog showing agent configurations (e.g. Claude Code, Aider) and repo selection | Show that multiple agents and repos are supported. |

### Tips for good screenshots

- Use a real repo with real code — it reads better than lorem ipsum.
- Have at least one session actively working and one idle so status indicators are visible.
- Resize the app window to roughly 1400x900 before capturing.
- On macOS, use Cmd+Shift+4 then Space to capture the window at Retina resolution, or use the Playwright E2E test setup with `E2E_TEST=true` for predictable content.

## Deployment

The site is configured for static export (`output: 'export'` in next.config.mjs). Deploy to Vercel with:

```
Root Directory: website
Framework: Next.js
```

Screenshots are git-tracked in `public/screenshots/` so no special build step is needed.
