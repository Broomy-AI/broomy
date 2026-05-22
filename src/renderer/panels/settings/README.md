# Settings Panel

Agent and repository configuration overlay.

## What it does

Renders as an overlay that replaces the center content area. Contains two main screens: a root screen listing agents and repos, and per-repo settings screens. Also handles agent setup, authentication, git identity configuration, and environment variables.

## Components

- `AgentSettings.tsx` -- Main settings container with navigation
- `SettingsRootScreen.tsx` -- Home screen: agent list + repo list
- `SettingsRepoScreen.tsx` -- Per-repo settings (isolation, commands, env vars)
- `AgentSettingsAgentTab.tsx` -- Agent CRUD UI
- `AgentSettingsRepoTab.tsx` -- Repo settings within agent config
- `RepoSettingsEditor.tsx` -- Shared repo settings editor
- `IsolationSettings.tsx` -- Worktree isolation toggle
- `ContainerInfoPanel.tsx` -- Dev container status display
- `EnvVarEditor.tsx` -- Environment variable key-value editor
- `AuthSetupSection.tsx` -- GitHub auth setup
- `AuthTerminal.tsx` -- Embedded terminal for auth flows
- `GitIdentitySetup.tsx` -- Git user.name/email configuration
- `ShowWhenPicker.tsx` -- Condition picker for command visibility

## Store dependencies

- `store/agents` -- Agent configurations
- `store/repos` -- Managed repositories
- `store/sessions` -- Panel visibility
