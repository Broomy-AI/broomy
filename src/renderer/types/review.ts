/**
 * Type definitions for the code review system.
 *
 * Defines the structure of AI-generated code reviews (ReviewData), including overview,
 * change patterns with source locations, potential issues with severity levels, design
 * decisions with alternatives, and requested changes. Also defines ReviewComparison for
 * tracking changes between successive reviews, PendingComment for draft PR comments,
 * and ReviewHistory for the full chain of reviews on a PR.
 */
export interface CodeLocation {
  file: string
  startLine: number
  endLine?: number
  snippet?: string
}

export interface RequestedChange {
  id: string
  description: string
  file?: string
  line?: number
}

export interface ReviewData {
  version: 1
  generatedAt: string
  prNumber?: number
  prTitle?: string
  headCommit?: string  // The commit SHA when review was generated
  overview: { purpose: string; approach: string }
  changePatterns: {
    id: string
    title: string
    description: string
    locations: CodeLocation[]
  }[]
  potentialIssues: {
    id: string
    severity: 'info' | 'warning' | 'concern'
    title: string
    description: string
    locations: CodeLocation[]
  }[]
  designDecisions: {
    id: string
    title: string
    description: string
    alternatives?: string[]
    locations: CodeLocation[]
  }[]
  // Requested changes from the reviewer (for tracking in follow-up reviews)
  requestedChanges?: RequestedChange[]
}

// Comparison of changes between reviews
export interface ReviewComparison {
  newCommitsSince: string[]  // Commit SHAs since last review
  newFileChanges: { file: string; changeType: 'added' | 'modified' | 'deleted' }[]
  requestedChangeStatus: {
    change: RequestedChange
    status: 'addressed' | 'not-addressed' | 'partially-addressed'
    notes?: string
  }[]
}

export interface PendingComment {
  id: string
  file: string
  line: number
  body: string
  createdAt: string
  pushed?: boolean
}

// History of reviews for a PR
export interface ReviewHistory {
  reviews: {
    generatedAt: string
    headCommit: string
    requestedChanges: RequestedChange[]
  }[]
}
