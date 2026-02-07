export default function TechBadge({ name }: { name: string }) {
  return (
    <span className="rounded-full border border-border-subtle bg-bg-elevated px-4 py-1.5 text-sm text-text-body">
      {name}
    </span>
  )
}
