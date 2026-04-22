/**
 * Shared Markdown component factories for react-markdown.
 *
 * Provides reusable component overrides for dark-themed Markdown rendering
 * with safe external link handling. Two size presets are available:
 * - 'default': Larger text for standalone markdown file viewing
 * - 'compact': Smaller text for embedded panels (e.g., review content)
 */
import { useState, useCallback } from 'react'
import type { Components } from 'react-markdown'

type SizePreset = 'default' | 'compact'

const SIZES = {
  default: {
    h1: 'text-2xl font-bold mt-6 mb-4',
    h2: 'text-xl font-semibold mt-5 mb-3',
    h3: 'text-lg font-semibold mt-4 mb-2',
    h4: 'text-base font-semibold mt-4 mb-2',
    p: 'my-2',
    code: { block: 'p-3 text-sm', inline: 'text-sm' },
    pre: 'p-3 my-2',
    blockquote: 'border-l-4 pl-4 my-2',
    list: 'ml-4 my-2',
    hr: 'my-4',
    img: 'my-2',
    table: 'my-3',
    th: 'px-3 py-1.5 text-xs',
    td: 'px-3 py-1.5 text-xs',
  },
  compact: {
    h1: 'text-base font-bold mt-3 mb-2',
    h2: 'text-sm font-semibold mt-3 mb-1.5',
    h3: 'text-sm font-semibold mt-2 mb-1',
    h4: 'text-sm font-medium mt-2 mb-1',
    p: 'my-1.5 text-sm leading-relaxed',
    code: { block: 'p-2 text-xs', inline: 'text-xs' },
    pre: 'p-2 my-1.5',
    blockquote: 'border-l-2 pl-3 my-1.5',
    list: 'ml-4 my-1.5 text-sm',
    hr: 'my-3',
    img: 'my-1.5',
    table: 'my-2',
    th: 'px-2 py-1 text-xs',
    td: 'px-2 py-1 text-xs',
  },
} as const

function handleLinkClick(e: React.MouseEvent, href: string | undefined) {
  e.preventDefault()
  if (href && /^https?:\/\//i.test(href)) void window.shell.openExternal(href)
}

function MarkdownImage({ src, alt, className }: { src?: string; alt?: string; className: string }) {
  const [lightbox, setLightbox] = useState(false)
  const close = useCallback(() => setLightbox(false), [])

  if (!src) return null
  return (
    <>
      <img
        src={src}
        alt={alt}
        className={`max-h-32 max-w-xs rounded cursor-pointer hover:opacity-80 transition-opacity ${className}`}
        onClick={() => setLightbox(true)}
      />
      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={close}>
          <img src={src} alt={alt} className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl" />
        </div>
      )}
    </>
  )
}

export function createMarkdownComponents(size: SizePreset = 'default'): Components {
  const s = SIZES[size]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type N = any
  return {
    h1: ({ children }: { children?: N }) => <h1 className={`${s.h1} text-text-primary`}>{children}</h1>,
    h2: ({ children }: { children?: N }) => <h2 className={`${s.h2} text-text-primary`}>{children}</h2>,
    h3: ({ children }: { children?: N }) => <h3 className={`${s.h3} text-text-primary`}>{children}</h3>,
    h4: ({ children }: { children?: N }) => <h4 className={`${s.h4} text-text-primary`}>{children}</h4>,
    p: ({ children }: { children?: N }) => <p className={`${s.p} text-text-primary`}>{children}</p>,
    a: ({ href, children }: { href?: string; children?: N }) => (
      <a href={href} className="text-accent hover:underline" onClick={(e) => handleLinkClick(e, href)}>
        {children}
      </a>
    ),
    code: ({ children, className }: { children?: N; className?: string }) => {
      const isBlock = className?.includes('language-')
      if (isBlock) {
        return <code className={`block bg-bg-tertiary ${s.code.block} rounded overflow-x-auto`}>{children}</code>
      }
      return <code className={`bg-bg-tertiary px-1 rounded ${s.code.inline}`}>{children}</code>
    },
    pre: ({ children }: { children?: N }) => <pre className={`bg-bg-tertiary ${s.pre} rounded overflow-x-auto`}>{children}</pre>,
    blockquote: ({ children }: { children?: N }) => <blockquote className={`${s.blockquote} border-border text-text-secondary italic`}>{children}</blockquote>,
    ul: ({ children }: { children?: N }) => <ul className={`list-disc ${s.list}`}>{children}</ul>,
    ol: ({ children }: { children?: N }) => <ol className={`list-decimal ${s.list}`}>{children}</ol>,
    li: ({ children }: { children?: N }) => <li className="text-text-primary">{children}</li>,
    hr: () => <hr className={`border-border ${s.hr}`} />,
    img: ({ src, alt }: { src?: string; alt?: string }) => <MarkdownImage src={src} alt={alt} className={s.img} />,
    table: ({ children }: { children?: N }) => <table className={`border-collapse ${s.table} w-full`}>{children}</table>,
    thead: ({ children }: { children?: N }) => <thead className="bg-bg-tertiary">{children}</thead>,
    tbody: ({ children }: { children?: N }) => <tbody>{children}</tbody>,
    tr: ({ children }: { children?: N }) => <tr className="border-b border-border">{children}</tr>,
    th: ({ children }: { children?: N }) => <th className={`${s.th} text-left font-semibold text-text-primary border border-border`}>{children}</th>,
    td: ({ children }: { children?: N }) => <td className={`${s.td} text-text-primary border border-border`}>{children}</td>,
  }
}
