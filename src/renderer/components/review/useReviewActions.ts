/**
 * Hook providing action handlers for the review panel.
 */
import { useCallback } from 'react'
import type { Session } from '../../store/sessions'
import type { ManagedRepo } from '../../../preload/index'
import type { ReviewDataState } from './useReviewData'

export interface ReviewActions {
  handleOpenPrUrl: () => void
}

export function useReviewActions(
  session: Session,
  _repo: ManagedRepo | undefined,
  _onSelectFile: (filePath: string, openInDiffMode: boolean, scrollToLine?: number, diffBaseRef?: string) => void,
  _state: ReviewDataState,
): ReviewActions {
  const handleOpenPrUrl = useCallback(() => { if (session.prUrl) _onSelectFile(session.prUrl, false) }, [session.prUrl, _onSelectFile])

  return {
    handleOpenPrUrl,
  }
}
