const KNOWN_AGENT_INSTALL_URLS: Record<string, string> = {
  claude: 'https://docs.anthropic.com/en/docs/claude-code/overview',
  codex: 'https://github.com/openai/codex',
  gemini: 'https://github.com/google-gemini/gemini-cli',
  copilot: 'https://github.com/github/gh-copilot',
  'gh copilot': 'https://github.com/github/gh-copilot',
  aider: 'https://aider.chat',
  junie: 'https://www.jetbrains.com/help/junie/get-started-with-junie.html',
}

/**
 * Look up the install URL for a known agent command.
 * Extracts the base command name (e.g. "claude --flag" → "claude").
 */
export function getAgentInstallUrl(command: string): string | null {
  const trimmed = command.trim()

  // Try the full command first (handles "gh copilot" style commands)
  if (KNOWN_AGENT_INSTALL_URLS[trimmed]) {
    return KNOWN_AGENT_INSTALL_URLS[trimmed]
  }

  // Try first two words (for "gh copilot --flags")
  const words = trimmed.split(/\s+/)
  if (words.length >= 2) {
    const twoWord = `${words[0]} ${words[1]}`
    if (KNOWN_AGENT_INSTALL_URLS[twoWord]) {
      return KNOWN_AGENT_INSTALL_URLS[twoWord]
    }
  }

  // Try first word only (for "claude --flag")
  const baseCommand = words[0]
  return KNOWN_AGENT_INSTALL_URLS[baseCommand] ?? null
}
