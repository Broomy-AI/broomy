import { create } from 'zustand'
import { categorizeError, type ErrorCategory } from '../utils/errorMessages'
import { buildGitHubIssueUrl } from '../utils/errorReporting'

export interface AppError {
  id: string
  message: string
  timestamp: number
  category: ErrorCategory
  detail?: string
  suggestion?: string
  context?: string
}

export type AddErrorInput = string | {
  message: string
  category?: ErrorCategory
  detail?: string
  suggestion?: string
  context?: string
}

interface ErrorStore {
  errors: AppError[]
  hasUnread: boolean

  // Actions
  addError: (input: AddErrorInput) => void
  dismissError: (id: string) => void
  clearAll: () => void
  markRead: () => void
  generateReportUrl: (errorId: string) => string | null
}

const generateId = () => `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

export const useErrorStore = create<ErrorStore>((set, get) => ({
  errors: [],
  hasUnread: false,

  addError: (input: AddErrorInput) => {
    let error: AppError

    if (typeof input === 'string') {
      const categorized = categorizeError(input)
      error = {
        id: generateId(),
        message: categorized.message,
        timestamp: Date.now(),
        category: categorized.category,
        suggestion: categorized.suggestion,
        detail: categorized.message !== input ? input : undefined,
      }
    } else {
      const categorized = input.category ? null : categorizeError(input.message)
      error = {
        id: generateId(),
        message: input.message,
        timestamp: Date.now(),
        category: input.category ?? categorized?.category ?? 'unknown',
        detail: input.detail,
        suggestion: input.suggestion ?? categorized?.suggestion,
        context: input.context,
      }
    }

    console.error('[App Error]', error.message, error.detail || '')
    set((state) => ({
      errors: [error, ...state.errors].slice(0, 50),
      hasUnread: true,
    }))
  },

  dismissError: (id: string) => {
    set((state) => ({
      errors: state.errors.filter((e) => e.id !== id),
    }))
  },

  clearAll: () => {
    set({ errors: [], hasUnread: false })
  },

  markRead: () => {
    set({ hasUnread: false })
  },

  generateReportUrl: (errorId: string) => {
    const error = get().errors.find((e) => e.id === errorId)
    if (!error) return null
    return buildGitHubIssueUrl({
      title: `[Bug] ${error.message.slice(0, 80)}`,
      errorMessage: error.detail || error.message,
      category: error.category,
    })
  },
}))
