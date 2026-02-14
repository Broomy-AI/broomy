import { create } from 'zustand'

// Tutorial step definitions
export interface TutorialStep {
  id: string
  title: string
  description: string
  link?: { label: string; url: string }
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'toggled-tutorial',
    title: 'Toggle this guide',
    description: 'The Guide panel is where you track your onboarding progress. Click the ? icon in the toolbar to show or hide it. You can reopen it anytime, so feel free to close it while you work and come back when you need it.',
  },
  {
    id: 'created-session',
    title: 'Create a session',
    description: 'A session connects a Git repository to an AI agent in its own worktree, so multiple agents can work on different tasks without interfering. Click "+ New Session" in the sidebar or welcome screen, choose a repo and branch, and Broomy sets up an isolated worktree for the agent.',
  },
  {
    id: 'viewed-explorer',
    title: 'Open Explorer',
    description: 'The Explorer shows your session\'s file tree alongside Git status, giving you a quick overview of what exists and what\'s changed. Toggle it with the toolbar button or Cmd/Ctrl+2, then expand folders and click files to view them.',
  },
  {
    id: 'viewed-file',
    title: 'View a file',
    description: 'The File Viewer opens files with syntax highlighting and diff support, so you can review exactly what your agent changed. Click any file in the Explorer, or press Cmd/Ctrl+P to open the Explorer search and find files by name. Changed files can be viewed as side-by-side diffs.',
  },
  {
    id: 'viewed-recent-files',
    title: 'View recent files',
    description: 'The Explorer has a Recent tab that shows files you\'ve recently opened, so you can quickly jump back to them. Switch to the Recent tab in the Explorer to see your file history and click any entry to reopen it.',
  },
  {
    id: 'used-agent',
    title: 'Chat with agent',
    description: 'The Agent terminal is where your AI coding agent runs — this is the core of Broomy. Open it with Cmd/Ctrl+4 and type a message or instruction. The agent reads your codebase, makes changes, and reports back, all inside the session\'s worktree.',
  },
  {
    id: 'used-terminal',
    title: 'Use terminal',
    description: 'Sometimes you need to run commands yourself — tests, builds, or inspecting output. The User Terminal gives you a shell already scoped to the session\'s worktree. Toggle it with the toolbar button or Cmd/Ctrl+5.',
  },
  {
    id: 'toggled-panel',
    title: 'Toggle panels',
    description: 'Keyboard shortcuts let you quickly show and hide panels to focus on what matters. Press Cmd/Ctrl+1 through 6 to toggle each panel, or use Ctrl+Tab to cycle through visible ones. Experiment with different layouts as you work.',
  },
  {
    id: 'used-source-control',
    title: 'Use source control',
    description: 'Once your agent has made changes you like, you\'ll want to commit them. The Explorer\'s Source Control section shows staged and unstaged changes. Stage the files you want, write a commit message, and commit — all without leaving Broomy.',
  },
  {
    id: 'viewed-markdown',
    title: 'Preview a Markdown file',
    description: 'Open a Markdown file in the File Viewer and toggle between raw source and rendered preview using the view-mode button. This is handy for reading READMEs, docs, or plan files your agent generates.',
  },
  {
    id: 'compared-branch',
    title: 'Compare branch to main',
    description: 'Use the Explorer\'s Source Control section to compare your session branch against main. This shows a summary of all changes the agent has made, helping you review before merging.',
  },
  {
    id: 'archived-session',
    title: 'Archive a session',
    description: 'When you\'re done with a session, right-click it in the sidebar and choose Archive. Archived sessions are hidden from the main list but can be restored later. This keeps your workspace tidy without losing history.',
  },
  {
    id: 'resolved-conflicts',
    title: 'Resolve merge conflicts',
    description: 'When your session branch has conflicts with main, Broomy can help. Ask the agent to resolve merge conflicts and it will pull the latest changes, identify conflicts, and fix them in the worktree.',
  },
  {
    id: 'used-review',
    title: 'Use review pane',
    description: 'The Review panel lets you review pull requests with AI assistance — see diffs, leave comments, and get summaries. You can also review your current branch to better understand all the code your agent wrote. Create a review session from the New Session dialog by selecting "Review" mode.',
  },
  {
    id: 'viewed-settings',
    title: 'Configure agents',
    description: 'Different agents have different strengths. Open Settings with the gear icon in the toolbar to add and configure which AI agents are available, specifying their launch command and working directory.',
  },
  {
    id: 'contribute-extension',
    title: 'Contribute an extension',
    description: 'Broomy is fully open source and extensible. If there\'s something you want it to do that it can\'t yet, submit a pull request to add the functionality you want.',
    link: { label: 'Broomy on GitHub', url: 'https://github.com/Broomy-AI/broomy' },
  },
] as const

export type TutorialStepId = typeof TUTORIAL_STEPS[number]['id']

export interface TutorialProgress {
  completedSteps: string[]
}

interface TutorialStore {
  completedSteps: string[]
  isLoaded: boolean

  // Actions
  loadTutorial: (profileId?: string) => Promise<void>
  saveTutorial: (profileId?: string) => Promise<void>
  markStepComplete: (stepId: string) => void
  markStepIncomplete: (stepId: string) => void
  resetProgress: () => void
}

// Current profile ID for saves
let currentProfileId: string | undefined

// Debounced save
let saveTimeout: ReturnType<typeof setTimeout> | null = null
const debouncedSave = (completedSteps: string[]) => {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    void window.config.load(currentProfileId).then((config) =>
      window.config.save({
        ...config,
        profileId: currentProfileId,
        tutorialProgress: {
          completedSteps,
        },
      })
    )
  }, 500)
}

export const useTutorialStore = create<TutorialStore>((set, get) => ({
  completedSteps: [],
  isLoaded: false,

  loadTutorial: async (profileId?: string) => {
    if (profileId !== undefined) {
      currentProfileId = profileId
    }
    try {
      const config = await window.config.load(currentProfileId)
      const progress = (config as { tutorialProgress?: TutorialProgress }).tutorialProgress
      set({
        completedSteps: progress?.completedSteps ?? [],
        isLoaded: true,
      })
    } catch {
      set({ completedSteps: [], isLoaded: true })
    }
  },

  saveTutorial: async () => {
    const { completedSteps } = get()
    // debouncedSave is synchronous (schedules a timeout), awaited for interface conformance
    await Promise.resolve(debouncedSave(completedSteps))
  },

  markStepComplete: (stepId: string) => {
    const { completedSteps } = get()
    if (completedSteps.includes(stepId)) return
    const newCompletedSteps = [...completedSteps, stepId]
    set({ completedSteps: newCompletedSteps })
    debouncedSave(newCompletedSteps)
  },

  markStepIncomplete: (stepId: string) => {
    const { completedSteps } = get()
    if (!completedSteps.includes(stepId)) return
    const newCompletedSteps = completedSteps.filter(s => s !== stepId)
    set({ completedSteps: newCompletedSteps })
    debouncedSave(newCompletedSteps)
  },

  resetProgress: () => {
    set({ completedSteps: [] })
    debouncedSave([])
  },
}))
