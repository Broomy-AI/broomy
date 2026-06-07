const RELEASE_URL = 'https://github.com/broomy-ai/broomy/releases/latest'

export function DownloadButtons({ compact }: { compact?: boolean }) {
  if (compact) {
    return (
      <a
        href={RELEASE_URL}
        className="rounded-lg bg-text-primary px-4 py-2 text-sm font-semibold text-bg-page transition-transform hover:scale-[1.02]"
      >
        Download
      </a>
    )
  }

  return (
    <a
      href={RELEASE_URL}
      className="inline-flex items-center gap-2 rounded-lg border border-border-hover px-8 py-4 text-lg font-semibold text-text-primary transition-all hover:scale-[1.02] hover:border-text-muted"
    >
      <DownloadIcon />
      Download
    </a>
  )
}

export default function DownloadButton() {
  return <DownloadButtons />
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}
