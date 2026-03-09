/**
 * Preload API for GitHub CLI interactions including issues, pull requests, and code reviews.
 */
import { ipcRenderer } from 'electron'
import type { GitHubIssue, GitHubPrStatus, GitHubPrComment, GitHubIssueComment, GitHubPrForReview } from './types'

export type GhApi = {
  isInstalled: () => Promise<boolean>
  issues: (repoDir: string) => Promise<GitHubIssue[]>
  searchIssues: (repoDir: string, query: string) => Promise<GitHubIssue[]>
  repoSlug: (repoDir: string) => Promise<string | null>
  prStatus: (repoDir: string) => Promise<GitHubPrStatus>
  hasWriteAccess: (repoDir: string) => Promise<boolean>
  prChecksStatus: (repoDir: string) => Promise<'passed' | 'failed' | 'pending' | 'none'>
  getPrCreateUrl: (repoDir: string) => Promise<string | null>
  prComments: (repoDir: string, prNumber: number) => Promise<GitHubPrComment[]>
  prDescription: (repoDir: string, prNumber: number) => Promise<string | null>
  prIssueComments: (repoDir: string, prNumber: number, page?: number, perPage?: number) => Promise<GitHubIssueComment[]>
  replyToComment: (repoDir: string, prNumber: number, commentId: number, body: string) => Promise<{ success: boolean; error?: string }>
  addReaction: (repoDir: string, commentId: number, reaction: string, commentType: 'review' | 'issue') => Promise<{ success: boolean; error?: string }>
  prsToReview: (repoDir: string) => Promise<GitHubPrForReview[]>
  submitDraftReview: (repoDir: string, prNumber: number, comments: { path: string; line: number; body: string }[]) => Promise<{ success: boolean; reviewId?: number; error?: string }>
  myReviewStatus: (repoDir: string, prNumber: number) => Promise<'pending' | 'reviewed' | null>
  currentUser: () => Promise<string | null>
}

export const ghApi: GhApi = {
  isInstalled: () => ipcRenderer.invoke('gh:isInstalled'),
  issues: (repoDir) => ipcRenderer.invoke('gh:issues', repoDir),
  searchIssues: (repoDir, query) => ipcRenderer.invoke('gh:searchIssues', repoDir, query),
  repoSlug: (repoDir) => ipcRenderer.invoke('gh:repoSlug', repoDir),
  prStatus: (repoDir) => ipcRenderer.invoke('gh:prStatus', repoDir),
  hasWriteAccess: (repoDir) => ipcRenderer.invoke('gh:hasWriteAccess', repoDir),
  prChecksStatus: (repoDir) => ipcRenderer.invoke('gh:prChecksStatus', repoDir),
  getPrCreateUrl: (repoDir) => ipcRenderer.invoke('gh:getPrCreateUrl', repoDir),
  prComments: (repoDir, prNumber) => ipcRenderer.invoke('gh:prComments', repoDir, prNumber),
  prDescription: (repoDir, prNumber) => ipcRenderer.invoke('gh:prDescription', repoDir, prNumber),
  prIssueComments: (repoDir, prNumber, page, perPage) => ipcRenderer.invoke('gh:prIssueComments', repoDir, prNumber, page, perPage),
  replyToComment: (repoDir, prNumber, commentId, body) => ipcRenderer.invoke('gh:replyToComment', repoDir, prNumber, commentId, body),
  addReaction: (repoDir, commentId, reaction, commentType) => ipcRenderer.invoke('gh:addReaction', repoDir, commentId, reaction, commentType),
  prsToReview: (repoDir) => ipcRenderer.invoke('gh:prsToReview', repoDir),
  submitDraftReview: (repoDir, prNumber, comments) => ipcRenderer.invoke('gh:submitDraftReview', repoDir, prNumber, comments),
  myReviewStatus: (repoDir, prNumber) => ipcRenderer.invoke('gh:myReviewStatus', repoDir, prNumber),
  currentUser: () => ipcRenderer.invoke('gh:currentUser'),
}
