/**
 * Chip showing whether the user has reviewed a PR: cyan "Review" (pending) or green "Reviewed".
 * Used in both the session sidebar card and the source control PR banner.
 */
export function ReviewStatusChip({ status }: { status: 'pending' | 'reviewed' }) {
  if (status === 'reviewed') {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-green-500/20 text-green-400 flex-shrink-0">
        Reviewed
      </span>
    )
  }
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-cyan-500/20 text-cyan-400 flex-shrink-0">
      Review
    </span>
  )
}
