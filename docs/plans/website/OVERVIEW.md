# Website Overview

## Positioning

Broomy is positioned as a **professional-grade desktop tool** — the kind of app a senior engineer would adopt as their daily driver for managing AI coding workflows. The website should feel like the landing pages of tools developers already trust: **Linear**, **Warp**, **Raycast**, or **Zed**. Clean. Confident. No gimmicks.

The open source angle is not a footnote — it's a core trust signal. The site should make it easy to verify the project is real: link to the repo, show the architecture, surface contribution paths. Developers are skeptical of polished marketing for tools that don't ship. The website earns trust by showing the product, not by describing it.

## Site Structure

### Single-page marketing site (v1)

One long-scrolling page with distinct sections, plus a separate `/docs` route for when we add documentation later.

```
/                  — Main marketing page
/docs (future)     — Documentation (not in v1)
```

### Page Sections (scroll order)

1. **Hero** — Full-width screenshot with tagline. No fluff.
2. **The Problem** — One paragraph. Why managing multiple AI agents across repos is painful today.
3. **Feature Showcase** — 4-5 feature sections, each with a screenshot and brief description.
4. **Architecture** — Brief technical overview showing this is a serious, well-built project.
5. **Open Source** — GitHub link, license (MIT), contribution guide, tech stack badges.
6. **Get Started** — Installation instructions (download + build from source).
7. **Footer** — GitHub, license, credits.

No pricing page. No sign-up form. No newsletter. This is an open source tool — the call to action is "clone it and try it."

---

## Section Details

### 1. Hero

- **Layout**: Full-width dark background. Large (1400px wide) screenshot of Broomy in action, showing multiple sessions with one working and one idle. The screenshot should show the Explorer panel open with file tree and git status visible.
- **Headline**: "Your command center for AI coding agents"
- **Subhead**: "Manage multiple AI sessions across repositories. See what every agent is doing. Ship faster."
- **CTA buttons**: "Download for macOS" (primary, links to GitHub Release .dmg) | "View on GitHub" (secondary, external link)
- **The download button is the most prominent element after the headline.** Users should never have to hunt for how to get the app. The button includes a subtitle with platform and version info ("Apple Silicon · v1.0.0").
- **A sticky nav bar** appears on scroll with a persistent "Download" button in the top-right corner, so the download is always one click away regardless of scroll position.
- **No animation on the screenshot.** A still image of real software is more credible than a flashy animation.

### 2. The Problem

Short, relatable paragraph:

> Working with AI coding agents means terminal tabs everywhere. Which agent finished? Which one needs input? What branch is that one on? What files did it change? You end up context-switching between terminal windows, git clients, and editors just to keep track.

No icons. No grid. Just text. Let the product speak.

### 3. Feature Showcase

Each feature gets its own section with:
- A heading
- 2-3 sentences of description
- A screenshot showing that feature in action
- Alternating left/right layout (screenshot | text, then text | screenshot)

**Features to showcase:**

**a) Multi-Session Sidebar**
- Screenshot: Sidebar showing 3+ sessions with different status indicators (working/idle), branch names, and unread notifications.
- Copy: "See every agent at a glance. Status indicators show which agents are working, which are idle, and which need your attention. Switch between sessions instantly."

**b) Agent Activity Detection**
- Screenshot: A session in "Working" state with spinner animation visible in the terminal, showing Claude reading files and generating code.
- Copy: "Broomy watches your agent's terminal output and understands what it's doing. Working, idle, waiting for input — you always know without reading the raw output."

**c) Integrated File Explorer & Git**
- Screenshot: Explorer panel open showing file tree with git status badges (modified, added), source control view with staged files, branch info.
- Copy: "Browse files, check git status, stage changes, and review diffs — all without leaving the window. Full source control built in."

**d) Code Review & Diffs**
- Screenshot: File viewer showing a side-by-side diff of changes an agent made, with the Monaco editor.
- Copy: "Review what your agents changed before committing. Side-by-side diffs, syntax highlighting, and full Monaco editor support."

**e) Multiple Agents & Repos**
- Screenshot: Settings panel or new session dialog showing different agent configurations (Claude Code, Aider) and repo selection.
- Copy: "Configure different agents for different tasks. Claude Code for one repo, Aider for another. Each session gets its own terminal, branch, and working directory."

### 4. Architecture

A brief "Under the Hood" section that signals engineering quality:

- **Tech stack badges**: Electron, React, TypeScript, Zustand, xterm.js, Monaco Editor, node-pty, simple-git
- **Architecture diagram**: The three-process model diagram from ARCHITECTURE.md (simplified for the website)
- **Key points** (as a clean list):
  - "Type-safe IPC between all processes"
  - "Intelligent agent status detection via terminal output parsing"
  - "Modular panel system with registry pattern"
  - "Zero-config persistence with debounced writes"
  - "Full E2E test suite with Playwright"

### 5. Open Source

- GitHub repository link (prominent)
- License badge (MIT)
- "Built in the open. Every line of code is on GitHub."
- Contribution callout: "We welcome contributions. Check the architecture guide and open an issue."
- Last commit / activity indicator (fetched at build time via GitHub API, or static)

### 6. Get Started

The download must be impossible to miss. Large centered button, repeated from the hero.

**Download** (primary, dominant):
```
┌─────────────────────────────────────┐
│   [Apple logo] Download for macOS   │
│   Apple Silicon · v1.0.0            │
└─────────────────────────────────────┘
```
Links directly to the `.dmg` file from the latest GitHub Release. No intermediate page.

**Build from source** (secondary, for contributors):
```bash
git clone https://github.com/robennals/broomer.git
cd broomer/main
pnpm install
pnpm dev
```

### 7. Footer

Minimal:
- "Broomy — Open source AI agent manager"
- GitHub link
- MIT License
- Built with Electron, React, TypeScript

---

## Content Principles

1. **Show, don't tell.** Every claim is backed by a screenshot of real software.
2. **Respect the reader.** No "revolutionary" or "game-changing." Developers see through hype.
3. **Be specific.** "See agent status at a glance" > "Improve your workflow."
4. **Brevity.** Each section should be readable in under 10 seconds.
5. **Credibility through transparency.** Link to source code. Show architecture. Surface the tech stack.
