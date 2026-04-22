/**
 * Fetch the current user's review status for a session and update the store.
 * Shared by all refresh paths (session switch, sidebar refresh, SC refresh).
 */
export async function fetchReviewStatus(
  session: { id: string; sessionType?: string; prNumber?: number; directory: string },
  updateReviewStatus: (sessionId: string, status: 'pending' | 'reviewed') => void,
): Promise<void> {
  if (session.sessionType !== 'review' || !session.prNumber) return
  const status = await window.gh.myReviewStatus(session.directory, session.prNumber).catch(() => null)
  if (status) {
    updateReviewStatus(session.id, status)
  }
}
