import { ipcRenderer } from 'electron'
import type { GitHubIssue, GitHubPrStatus, GitHubPrComment, GitHubPrForReview } from './types'

export type GhApi = {
  isInstalled: () => Promise<boolean>
  issues: (repoDir: string) => Promise<GitHubIssue[]>
  repoSlug: (repoDir: string) => Promise<string | null>
  prStatus: (repoDir: string) => Promise<GitHubPrStatus>
  hasWriteAccess: (repoDir: string) => Promise<boolean>
  mergeBranchToMain: (repoDir: string) => Promise<{ success: boolean; error?: string }>
  getPrCreateUrl: (repoDir: string) => Promise<string | null>
  prComments: (repoDir: string, prNumber: number) => Promise<GitHubPrComment[]>
  replyToComment: (repoDir: string, prNumber: number, commentId: number, body: string) => Promise<{ success: boolean; error?: string }>
  prsToReview: (repoDir: string) => Promise<GitHubPrForReview[]>
  submitDraftReview: (repoDir: string, prNumber: number, comments: { path: string; line: number; body: string }[]) => Promise<{ success: boolean; reviewId?: number; error?: string }>
}

export const ghApi: GhApi = {
  isInstalled: () => ipcRenderer.invoke('gh:isInstalled'),
  issues: (repoDir) => ipcRenderer.invoke('gh:issues', repoDir),
  repoSlug: (repoDir) => ipcRenderer.invoke('gh:repoSlug', repoDir),
  prStatus: (repoDir) => ipcRenderer.invoke('gh:prStatus', repoDir),
  hasWriteAccess: (repoDir) => ipcRenderer.invoke('gh:hasWriteAccess', repoDir),
  mergeBranchToMain: (repoDir) => ipcRenderer.invoke('gh:mergeBranchToMain', repoDir),
  getPrCreateUrl: (repoDir) => ipcRenderer.invoke('gh:getPrCreateUrl', repoDir),
  prComments: (repoDir, prNumber) => ipcRenderer.invoke('gh:prComments', repoDir, prNumber),
  replyToComment: (repoDir, prNumber, commentId, body) => ipcRenderer.invoke('gh:replyToComment', repoDir, prNumber, commentId, body),
  prsToReview: (repoDir) => ipcRenderer.invoke('gh:prsToReview', repoDir),
  submitDraftReview: (repoDir, prNumber, comments) => ipcRenderer.invoke('gh:submitDraftReview', repoDir, prNumber, comments),
}
