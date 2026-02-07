# Page Content

All copy for the website, section by section. Written to be concise, specific, and respectful of the reader's time.

---

## Nav Bar (appears on scroll)

Left: **Broomy**
Right: **[Download for macOS]** button

---

## Hero

### Headline
```
Your command center for AI coding agents
```

### Subheadline
```
Manage multiple AI sessions across repositories.
See what every agent is doing. Ship faster.
```

### CTA Buttons
```
[Download for macOS]   [View on GitHub →]
```

The download button includes a small subtitle: `Apple Silicon · v1.0.0` (version fetched at build time).

### Screenshot
`hero.png` — Full app with agent working, explorer open, sidebar showing multiple sessions.

---

## The Problem

```
If you use AI coding agents, you know the pain. Terminal tabs everywhere.
Which agent finished? Which one needs input? What branch is it on? What files did it change?

You end up bouncing between terminal windows, git clients, and your editor
just to keep track of what's happening across your projects.
```

No heading for this section — just the text, centered, with generous whitespace above and below. Slightly larger font (text-lg). Max width 680px.

---

## Feature Sections

### Feature 1: Multi-Session Management

**Eyebrow**: `SESSIONS`
**Heading**: `Every agent, one sidebar`
**Body**:
```
Run Claude Code on your backend, Aider on your frontend, and keep a terminal
open for your docs — all in one window. Status indicators show which agents
are working, which are idle, and which just finished and need your attention.
```
**Screenshot**: `sidebar.png` (or hero with sidebar highlighted)
**Direction**: Screenshot left, text right

---

### Feature 2: Agent Activity Detection

**Eyebrow**: `STATUS`
**Heading**: `Know what your agents are doing`
**Body**:
```
Broomy watches terminal output and understands agent state. Working, idle,
waiting for input — you see it at a glance. When an agent finishes a task,
you get a notification so nothing slips through.
```
**Screenshot**: Close crop of a session showing "Working" status with spinner and tool use output in the terminal.
**Direction**: Text left, screenshot right

---

### Feature 3: File Explorer & Source Control

**Eyebrow**: `FILES`
**Heading**: `Built-in source control`
**Body**:
```
Browse your repo, check git status, stage changes, and commit — without
switching windows. See exactly what your agents changed, with file status
badges showing modifications, additions, and deletions.
```
**Screenshot**: `explorer.png` — Explorer panel with file tree and source control view
**Direction**: Screenshot left, text right

---

### Feature 4: Code Review & Diffs

**Eyebrow**: `REVIEW`
**Heading**: `Review before you commit`
**Body**:
```
See side-by-side diffs of every change your agents made. Full syntax
highlighting powered by Monaco Editor — the same engine behind VS Code.
Catch issues before they hit your branch.
```
**Screenshot**: `diff.png` — Diff view showing code changes
**Direction**: Text left, screenshot right

---

### Feature 5: Multiple Agents & Repos

**Eyebrow**: `AGENTS`
**Heading**: `Your agents, your way`
**Body**:
```
Configure Claude Code, Aider, or any CLI-based agent. Each session gets its
own terminal, working directory, and branch. Set up different agents for
different repos with custom environment variables.
```
**Screenshot**: `settings.png` — Settings panel with agent configurations
**Direction**: Screenshot left, text right

---

## Architecture Section

**Heading**: `Built for developers, by developers`

**Body**:
```
Broomy is a native desktop app built on proven technology.
No web wrappers. No Electron bloat. Just fast, reliable tooling.
```

**Tech stack** (displayed as badges):
```
Electron    React    TypeScript    Zustand    xterm.js    Monaco Editor    node-pty    simple-git
```

**Architecture highlights** (clean list):
```
• Type-safe IPC between all processes
• Intelligent agent status detection via terminal output parsing
• Modular panel system — show what you need, hide what you don't
• Full E2E test suite with Playwright
• Zero external services — everything runs locally
```

---

## Open Source Section

**Heading**: `Open source. MIT licensed.`

**Body**:
```
Every line of code is on GitHub. Read the source, open an issue,
or submit a pull request. Broomy is built in the open.
```

**GitHub CTA**:
```
[View on GitHub →]
```

With the repo URL prominently displayed below the button:
```
github.com/robennals/broomer
```

**Stats** (fetched at build time, displayed as small metrics):
```
[Stars] [Forks] [License: MIT] [Latest commit: 2 days ago]
```

---

## Get Started Section

**Heading**: `Get started`

### Download Path (primary)
```
┌─────────────────────────────────────┐
│                                     │
│    [Apple logo] Download for macOS  │
│    Apple Silicon · v1.0.0           │
│                                     │
└─────────────────────────────────────┘
```

Large, centered download button. This is the primary CTA for the whole page.

### Build from Source Path (secondary)
```
Or build from source:
```

```bash
git clone https://github.com/robennals/broomer.git
cd broomer/main
pnpm install
pnpm dev
```

Displayed in a styled code block with a copy button.

### Requirements note
```
Requires macOS and pnpm. See the README for full setup instructions.
```

---

## Footer

```
Broomy — Open source desktop app for managing AI coding agents.
MIT License · GitHub · Built with Electron, React, and TypeScript.
```

Single line, centered, small text, generous top padding.

---

## Meta / SEO

### Page Title
```
Broomy — Command center for AI coding agents
```

### Meta Description
```
Manage multiple AI coding sessions across repositories. Open source desktop app with agent status detection, file explorer, git integration, and code review. Download for macOS.
```

### Open Graph
```
og:title       — Broomy — Command center for AI coding agents
og:description — Manage multiple AI coding sessions across repositories. Open source desktop app for developers.
og:image       — /screenshots/hero.png
og:type        — website
```

### Structured Data (optional)
```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Broomy",
  "operatingSystem": "macOS",
  "applicationCategory": "DeveloperApplication",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
  "license": "https://opensource.org/licenses/MIT"
}
```

---

## Tone Guidelines

- **No superlatives.** No "revolutionary", "game-changing", "powerful". Let the product speak.
- **No buzzwords.** No "leverage", "empower", "seamless". Just describe what it does.
- **Specific > vague.** "See which agents are working" > "Improve your workflow."
- **Active voice.** "Broomy watches terminal output" > "Terminal output is monitored."
- **Short sentences.** If a sentence has a comma, consider splitting it.
- **Technical accuracy.** Don't oversell. If it's Electron, say Electron. Developers appreciate honesty.
