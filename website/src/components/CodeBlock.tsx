'use client'

import { useState } from 'react'

export default function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative overflow-hidden rounded-lg border border-border-subtle bg-bg-card">
      <button
        onClick={handleCopy}
        className="absolute top-3 right-3 rounded border border-border-subtle bg-bg-elevated px-2 py-1 text-xs text-text-muted transition-colors hover:border-border-hover hover:text-text-body"
        aria-label="Copy to clipboard"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre className="overflow-x-auto p-6 font-mono text-sm leading-relaxed text-text-body">
        {code.split('\n').map((line, i) => (
          <div key={i}>
            <span className="text-text-muted select-none">$ </span>
            {line}
          </div>
        ))}
      </pre>
    </div>
  )
}
