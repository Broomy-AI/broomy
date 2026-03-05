/**
 * Minimal error detail store.
 *
 * Provides `showErrorDetail` / `hideErrorDetail` for the `ErrorDetailModal`
 * and `DialogErrorBanner` components. All other error handling uses local
 * component state with `DialogErrorBanner` inline.
 */
import { create } from 'zustand'

export interface AppError {
  id: string
  message: string
  displayMessage: string
  detail?: string
  scope: 'app'
  dismissed: boolean
  timestamp: number
}

interface ErrorStore {
  detailError: AppError | null
  showErrorDetail: (error: AppError) => void
  hideErrorDetail: () => void
}

export const useErrorStore = create<ErrorStore>((set) => ({
  detailError: null,

  showErrorDetail: (error: AppError) => {
    set({ detailError: error })
  },

  hideErrorDetail: () => {
    set({ detailError: null })
  },
}))
