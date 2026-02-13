import type { CodeLocation } from '../../types/review'

export function LocationLink({
  location,
  onClick,
}: {
  location: CodeLocation
  directory: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="text-xs text-accent hover:text-accent/80 font-mono truncate block transition-colors"
      title={`${location.file}:${location.startLine}`}
    >
      {location.file}:{location.startLine}
      {location.endLine && location.endLine !== location.startLine ? `-${location.endLine}` : ''}
    </button>
  )
}

export function SeverityBadge({ severity }: { severity: 'info' | 'warning' | 'concern' }) {
  const colors = {
    info: 'bg-blue-500/20 text-blue-400',
    warning: 'bg-yellow-500/20 text-yellow-400',
    concern: 'bg-red-500/20 text-red-400',
  }
  return (
    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${colors[severity]}`}>
      {severity}
    </span>
  )
}

export function ChangeStatusBadge({ status }: { status: 'addressed' | 'not-addressed' | 'partially-addressed' }) {
  const colors = {
    'addressed': 'bg-green-500/20 text-green-400',
    'not-addressed': 'bg-red-500/20 text-red-400',
    'partially-addressed': 'bg-yellow-500/20 text-yellow-400',
  }
  const labels = {
    'addressed': 'Addressed',
    'not-addressed': 'Not addressed',
    'partially-addressed': 'Partial',
  }
  return (
    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${colors[status]}`}>
      {labels[status]}
    </span>
  )
}
