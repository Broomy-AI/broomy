/**
 * Hook providing action handlers for review generation and gitignore management.
 */
import { useCallback } from 'react'
import type { Session } from '../../store/sessions'
import type { ManagedRepo } from '../../../preload/index'
import { buildMarkdownReviewPrompt } from '../../utils/reviewPromptBuilder'
import { sendSkillAwarePrompt } from '../../utils/skillAwarePrompt'
import type { ReviewDataState } from './useReviewData'

/**
 * Check if .broomy/output/ is gitignored (via .broomy/.gitignore).
 */
async function checkOutputGitignore(directory: string): Promise<boolean> {
  try {
    // If .broomy/ itself is in the repo's .gitignore, output is already ignored
    if (await checkLegacyBroomyGitignore(directory)) return true

    const broomyGitignorePath = `${directory}/.broomy/.gitignore`
    const exists = await window.fs.exists(broomyGitignorePath)
    if (!exists) return false

    const content = await window.fs.readFile(broomyGitignorePath)
    const lines = content.split(/\r?\n/).map((l: string) => l.trim())
    return lines.some((line: string) => line === 'output' || line === 'output/' || line === '/output' || line === '/output/')
  } catch {
    return false
  }
}

/**
 * Create .broomy/.gitignore to ignore the output/ subdirectory.
 */
async function addOutputGitignore(directory: string): Promise<void> {
  const broomyDir = `${directory}/.broomy`
  await window.fs.mkdir(broomyDir)
  const gitignorePath = `${broomyDir}/.gitignore`
  const exists = await window.fs.exists(gitignorePath)
  if (exists) {
    const content = await window.fs.readFile(gitignorePath)
    const lines = content.split(/\r?\n/).map((l: string) => l.trim())
    if (!lines.some((line: string) => line === 'output' || line === 'output/' || line === '/output' || line === '/output/')) {
      await window.fs.appendFile(gitignorePath, '\n/output/\n')
    }
  } else {
    await window.fs.writeFile(gitignorePath, '# Broomy generated files\n/output/\n')
  }
}

/**
 * Check if .broomy/ itself is in the repo's .gitignore (legacy pattern).
 */
export async function checkLegacyBroomyGitignore(directory: string): Promise<boolean> {
  try {
    const gitignorePath = `${directory}/.gitignore`
    const exists = await window.fs.exists(gitignorePath)
    if (!exists) return false

    const content = await window.fs.readFile(gitignorePath)
    const lines = content.split(/\r?\n/).map((l: string) => l.trim())
    return lines.some((line: string) => line === '.broomy' || line === '.broomy/' || line === '/.broomy' || line === '/.broomy/')
  } catch {
    return false
  }
}

/**
 * Remove .broomy/ from the repo's .gitignore (legacy cleanup).
 */
export async function removeLegacyBroomyGitignore(directory: string): Promise<void> {
  try {
    const gitignorePath = `${directory}/.gitignore`
    const exists = await window.fs.exists(gitignorePath)
    if (!exists) return

    const content = await window.fs.readFile(gitignorePath)
    const lines = content.split(/\r?\n/)
    const filtered = lines.filter((line: string) => {
      const trimmed = line.trim()
      // Remove .broomy gitignore entries and their comment headers
      if (trimmed === '.broomy' || trimmed === '.broomy/' || trimmed === '/.broomy' || trimmed === '/.broomy/') return false
      return true
    })
    // Also remove "# Broomy review data" comment lines that preceded the entry
    const cleaned = filtered.filter((line: string, i: number) => {
      if (line.trim() === '# Broomy review data' && (i === filtered.length - 1 || filtered[i + 1]?.trim() === '')) return false
      return true
    })
    await window.fs.writeFile(gitignorePath, cleaned.join('\n'))
  } catch {
    // Non-fatal
  }
}

export interface ReviewActions {
  handleGenerateReview: () => Promise<void>
  handleOpenPrUrl: () => void
  handleGitignoreAdd: () => Promise<void>
  handleGitignoreContinue: () => Promise<void>
  handleGitignoreCancel: () => void
}

export function useReviewActions(
  session: Session,
  repo: ManagedRepo | undefined,
  _onSelectFile: (filePath: string, openInDiffMode: boolean, scrollToLine?: number, diffBaseRef?: string) => void,
  state: ReviewDataState,
): ReviewActions {
  const {
    broomyDir, outputDir, promptFilePath,
    setFetching, setWaitingForAgent, setFetchingStatus,
    setError, setShowGitignoreModal, setPendingGenerate,
  } = state

  const proceedWithGeneration = async () => {
    setShowGitignoreModal(false)
    setPendingGenerate(false)
    setFetching(true)
    setError(null)

    try {
      // Fetch the base branch so origin/<base> is up-to-date for the diff
      try {
        const baseBranch = session.prBaseBranch || 'main'
        await window.git.fetchBranch(session.directory, baseBranch)
      } catch {
        // Non-fatal - might not have network
      }

      // Pull latest changes from the PR branch before reviewing
      if (session.prNumber) {
        try {
          const branch = await window.git.getBranch(session.directory)
          await window.git.syncReviewBranch(session.directory, branch, session.prNumber)
        } catch {
          // Non-fatal - might not have network
        }
      }

      setFetching(false)
      setWaitingForAgent(true)

      // Create .broomy/output directory
      await window.fs.mkdir(broomyDir)
      await window.fs.mkdir(outputDir)

      // Fetch previous head commit for re-review detection
      let previousHeadCommit: string | undefined
      try {
        const historyFilePath = `${broomyDir}/review-history.json`
        const historyExists = await window.fs.exists(historyFilePath)
        if (historyExists) {
          const content = await window.fs.readFile(historyFilePath)
          const history = JSON.parse(content) as { reviews: { headCommit: string }[] }
          if (history.reviews.length > 0) {
            previousHeadCommit = history.reviews[0].headCommit
          }
        }
      } catch {
        // Non-fatal
      }

      // Fetch PR description if available
      let prDescription: string | undefined
      if (session.prNumber) {
        try {
          const body = await window.gh.prDescription(session.directory, session.prNumber)
          if (body) prDescription = body
        } catch {
          // Non-fatal
        }
      }

      // Build the markdown review prompt
      const reviewInstructions = repo?.reviewInstructions || ''
      const prompt = buildMarkdownReviewPrompt(session, reviewInstructions, {
        previousHeadCommit,
        prDescription,
      })

      // Write the prompt file
      await window.fs.writeFile(promptFilePath, prompt)

      // Write context for the skill
      await window.fs.writeFile(`${outputDir}/context.json`, JSON.stringify({
        prNumber: session.prNumber,
        prBaseBranch: session.prBaseBranch || 'main',
        prUrl: session.prUrl,
      }, null, 2))

      // Send command to agent terminal (skill-aware)
      const fallback = 'Please read and follow the instructions in .broomy/output/review-prompt.md'
      await sendSkillAwarePrompt({
        action: 'review-md',
        agentPtyId: session.agentPtyId!,
        directory: session.directory,
        agentId: session.agentId,
        fallbackPrompt: fallback,
      })
      setFetchingStatus('sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setFetching(false)
      setWaitingForAgent(false)
      setFetchingStatus(null)
    }
  }

  const handleGenerateReview = useCallback(async () => {
    if (!session.agentPtyId) {
      setError('No agent terminal found. Wait for the agent to start.')
      return
    }

    // Check if output gitignore is set up
    const hasOutputGitignore = await checkOutputGitignore(session.directory)
    if (!hasOutputGitignore) {
      setPendingGenerate(true)
      setShowGitignoreModal(true)
      return
    }

    await proceedWithGeneration()
  }, [session, repo?.reviewInstructions])

  const handleGitignoreAdd = async () => {
    try {
      await addOutputGitignore(session.directory)
    } catch (err) {
      setError(`Failed to create .broomy/.gitignore: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
    await proceedWithGeneration()
  }

  const handleGitignoreContinue = () => proceedWithGeneration()
  const handleGitignoreCancel = () => { setShowGitignoreModal(false); setPendingGenerate(false) }

  const handleOpenPrUrl = useCallback(() => { if (session.prUrl) _onSelectFile(session.prUrl, false) }, [session.prUrl, _onSelectFile])

  return {
    handleGenerateReview,
    handleOpenPrUrl,
    handleGitignoreAdd,
    handleGitignoreContinue,
    handleGitignoreCancel,
  }
}
