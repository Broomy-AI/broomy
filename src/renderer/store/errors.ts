/**
 * Application error tracking store.
 *
 * Collects runtime errors into a capped list (max 50) with timestamps and an
 * unread indicator. Errors are logged to console and displayed in the UI.
 * This store is purely in-memory and never persisted to disk.
 */
import { create } from 'zustand'

export interface AppError {
  id: string
  message: string
  timestamp: number
}

interface ErrorStore {
  errors: AppError[]
  hasUnread: boolean

  // Actions
  addError: (message: string) => void
  dismissError: (id: string) => void
  clearAll: () => void
  markRead: () => void
}

const generateId = () => `error-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`

export const useErrorStore = create<ErrorStore>((set) => ({
  errors: [],
  hasUnread: false,

  addError: (message: string) => {
    const error: AppError = {
      id: generateId(),
      message,
      timestamp: Date.now(),
    }
    console.error('[App Error]', message)
    set((state) => ({
      errors: [error, ...state.errors].slice(0, 50), // Keep last 50 errors
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
}))
