// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '../../../test/react-setup'

import { MarkdownViewer } from './MarkdownViewer'

const MarkdownViewerComponent = MarkdownViewer.component

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MarkdownViewer plugin', () => {
  it('has correct id and name', () => {
    expect(MarkdownViewer.id).toBe('markdown')
    expect(MarkdownViewer.name).toBe('Preview')
  })

  it('canHandle returns true for markdown extensions', () => {
    expect(MarkdownViewer.canHandle('README.md')).toBe(true)
    expect(MarkdownViewer.canHandle('doc.markdown')).toBe(true)
    expect(MarkdownViewer.canHandle('page.mdx')).toBe(true)
  })

  it('canHandle returns false for non-markdown extensions', () => {
    expect(MarkdownViewer.canHandle('file.ts')).toBe(false)
    expect(MarkdownViewer.canHandle('file.txt')).toBe(false)
  })

  it('has higher priority than Monaco default', () => {
    expect(MarkdownViewer.priority).toBe(50)
  })
})

describe('MarkdownViewerComponent', () => {
  it('renders markdown content as HTML', () => {
    render(<MarkdownViewerComponent filePath="test.md" content="# Hello World" />)
    expect(screen.getByText('Hello World')).toBeTruthy()
    // Check it rendered as h1
    const heading = screen.getByText('Hello World')
    expect(heading.tagName).toBe('H1')
  })

  it('renders paragraphs', () => {
    render(<MarkdownViewerComponent filePath="test.md" content="Some paragraph text." />)
    const para = screen.getByText('Some paragraph text.')
    expect(para.tagName).toBe('P')
  })

  it('renders links', () => {
    render(<MarkdownViewerComponent filePath="test.md" content="[Click here](https://example.com)" />)
    const link = screen.getByText('Click here')
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('https://example.com')
  })

  it('renders unordered lists', () => {
    render(<MarkdownViewerComponent filePath="test.md" content={"- Item A\n- Item B"} />)
    expect(screen.getByText('Item A')).toBeTruthy()
    expect(screen.getByText('Item B')).toBeTruthy()
  })

  it('renders headings at different levels', () => {
    render(<MarkdownViewerComponent filePath="test.md" content={"## Second Level\n### Third Level"} />)
    const h2 = screen.getByText('Second Level')
    expect(h2.tagName).toBe('H2')
    const h3 = screen.getByText('Third Level')
    expect(h3.tagName).toBe('H3')
  })

  it('renders blockquotes', () => {
    render(<MarkdownViewerComponent filePath="test.md" content="> Quote text" />)
    const quote = screen.getByText('Quote text')
    expect(quote.closest('blockquote')).toBeTruthy()
  })

  it('renders inline code', () => {
    render(<MarkdownViewerComponent filePath="test.md" content="Use `npm install` to install" />)
    const code = screen.getByText('npm install')
    expect(code.tagName).toBe('CODE')
  })
})
