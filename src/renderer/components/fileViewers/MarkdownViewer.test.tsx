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

  it('renders h4 heading', () => {
    render(<MarkdownViewerComponent filePath="test.md" content="#### Fourth Level" />)
    const h4 = screen.getByText('Fourth Level')
    expect(h4.tagName).toBe('H4')
  })

  it('renders fenced code blocks', () => {
    render(<MarkdownViewerComponent filePath="test.md" content={'```javascript\nconst x = 1\n```'} />)
    const code = screen.getByText('const x = 1')
    expect(code.tagName).toBe('CODE')
    expect(code.closest('pre')).toBeTruthy()
  })

  it('renders ordered lists', () => {
    const { container } = render(<MarkdownViewerComponent filePath="test.md" content={"1. First item\n2. Second item\n3. Third item"} />)
    const ol = container.querySelector('ol')
    expect(ol).toBeTruthy()
    expect(screen.getByText('First item')).toBeTruthy()
  })

  it('renders horizontal rules', () => {
    const { container } = render(<MarkdownViewerComponent filePath="test.md" content={"Above paragraph\n\n---\n\nBelow paragraph"} />)
    const hr = container.querySelector('hr')
    expect(hr).toBeTruthy()
  })

  it('renders images', () => {
    render(<MarkdownViewerComponent filePath="test.md" content="![Alt text](https://example.com/img.png)" />)
    const img = screen.getByAltText('Alt text')
    expect(img.tagName).toBe('IMG')
    expect(img.getAttribute('src')).toBe('https://example.com/img.png')
  })

  it('renders tables', () => {
    const tableMarkdown = '| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1 | Cell 2 |'
    const { container } = render(<MarkdownViewerComponent filePath="test.md" content={tableMarkdown} />)
    expect(container.querySelector('table')).toBeTruthy()
    expect(container.querySelector('thead')).toBeTruthy()
    expect(container.querySelector('tbody')).toBeTruthy()
    expect(container.querySelector('th')).toBeTruthy()
    expect(container.querySelector('td')).toBeTruthy()
    expect(screen.getByText('Header 1')).toBeTruthy()
    expect(screen.getByText('Cell 1')).toBeTruthy()
  })
})
