/**
 * Chip showing whether the user has reviewed a PR: cyan "Review" (pending) or green "Reviewed".
 * Used in both the session sidebar card and the source control PR banner.
 */
export function ReviewStatusChip({ status }: { status: 'pending' | 'reviewed' }) {
  if (status === 'reviewed') {
    return (
      <span className="text-3xs px-1.5 py-0.5 rounded font-semibold bg-success-base/20 text-success-fg flex-shrink-0">
        Reviewed
      </span>
    )
  }
  return (
    <span className="text-3xs px-1.5 py-0.5 rounded font-semibold bg-note-base/20 text-note-fg flex-shrink-0">
      Review
    </span>
  )
}
