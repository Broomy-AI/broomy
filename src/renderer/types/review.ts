export interface CodeLocation {
  file: string
  startLine: number
  endLine?: number
  snippet?: string
}

export interface ReviewData {
  version: 1
  generatedAt: string
  prNumber?: number
  prTitle?: string
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
}

export interface PendingComment {
  id: string
  file: string
  line: number
  body: string
  createdAt: string
  pushed?: boolean
}
