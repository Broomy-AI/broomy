/**
 * Markdown preview viewer using react-markdown with GitHub Flavored Markdown support.
 *
 * Renders markdown content with dark-theme-styled custom components for headings,
 * links, code blocks, blockquotes, tables, images, and lists. Uses remark-gfm for
 * tables, strikethrough, and other GFM extensions. Registered at higher priority than
 * Monaco for .md/.markdown/.mdx files so preview is the default view.
 */
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { FileViewerPlugin, FileViewerComponentProps } from './types'
import { matchesExtensions } from './types'

const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'mdx']

function MarkdownViewerComponent({ content }: FileViewerComponentProps) {
  return (
    <div className="h-full overflow-auto p-4 bg-bg-primary">
      <div className="max-w-3xl mx-auto prose prose-invert prose-sm">
        <Markdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Style overrides to match dark theme
            h1: ({ children }) => <h1 className="text-2xl font-bold mt-6 mb-4 text-text-primary">{children}</h1>,
            h2: ({ children }) => <h2 className="text-xl font-semibold mt-5 mb-3 text-text-primary">{children}</h2>,
            h3: ({ children }) => <h3 className="text-lg font-semibold mt-4 mb-2 text-text-primary">{children}</h3>,
            h4: ({ children }) => <h4 className="text-base font-semibold mt-4 mb-2 text-text-primary">{children}</h4>,
            p: ({ children }) => <p className="my-2 text-text-primary">{children}</p>,
            a: ({ href, children }) => <a href={href} className="text-accent hover:underline">{children}</a>,
            code: ({ children, className }) => {
              const isBlock = className?.includes('language-')
              if (isBlock) {
                return <code className="block bg-bg-tertiary p-3 rounded overflow-x-auto text-sm">{children}</code>
              }
              return <code className="bg-bg-tertiary px-1 rounded text-sm">{children}</code>
            },
            pre: ({ children }) => <pre className="bg-bg-tertiary p-3 rounded overflow-x-auto my-2">{children}</pre>,
            blockquote: ({ children }) => <blockquote className="border-l-4 border-border pl-4 my-2 text-text-secondary italic">{children}</blockquote>,
            ul: ({ children }) => <ul className="list-disc ml-4 my-2">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal ml-4 my-2">{children}</ol>,
            li: ({ children }) => <li className="text-text-primary">{children}</li>,
            hr: () => <hr className="border-border my-4" />,
            img: ({ src, alt }) => <img src={src} alt={alt} className="max-w-full my-2 rounded" />,
            table: ({ children }) => <table className="border-collapse my-3 w-full">{children}</table>,
            thead: ({ children }) => <thead className="bg-bg-tertiary">{children}</thead>,
            tbody: ({ children }) => <tbody>{children}</tbody>,
            tr: ({ children }) => <tr className="border-b border-border">{children}</tr>,
            th: ({ children }) => <th className="px-3 py-1.5 text-left text-xs font-semibold text-text-primary border border-border">{children}</th>,
            td: ({ children }) => <td className="px-3 py-1.5 text-xs text-text-primary border border-border">{children}</td>,
          }}
        >
          {content}
        </Markdown>
      </div>
    </div>
  )
}

export const MarkdownViewer: FileViewerPlugin = {
  id: 'markdown',
  name: 'Preview',
  icon: (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  canHandle: (filePath: string) => matchesExtensions(filePath, MARKDOWN_EXTENSIONS),
  priority: 50, // Higher than Monaco for markdown files
  component: MarkdownViewerComponent,
}
