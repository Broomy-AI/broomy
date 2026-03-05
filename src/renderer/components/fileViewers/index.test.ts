import { describe, it, expect, vi } from 'vitest'

// Mock the viewer components before importing the registry
vi.mock('./MonacoViewer', () => ({
  MonacoViewer: {
    id: 'monaco',
    name: 'Code Editor',
    canHandle: () => true,
    priority: 0,
    component: () => null,
  },
}))

vi.mock('./ImageViewer', () => ({
  ImageViewer: {
    id: 'image',
    name: 'Image Viewer',
    canHandle: (path: string) => /\.(png|jpg|jpeg|gif|svg|webp|ico|bmp)$/i.test(path),
    priority: 10,
    component: () => null,
  },
}))

vi.mock('./MarkdownViewer', () => ({
  MarkdownViewer: {
    id: 'markdown',
    name: 'Markdown Preview',
    canHandle: (path: string) => /\.md$/i.test(path),
    priority: 10,
    component: () => null,
  },
}))

import { getViewersForFile, getDefaultViewer, isTextContent } from './index'

describe('fileViewers registry', () => {
  describe('getViewersForFile', () => {
    it('returns monaco for any file', () => {
      const viewers = getViewersForFile('test.ts')
      expect(viewers.some((v) => v.id === 'monaco')).toBe(true)
    })

    it('returns image viewer for png files sorted by priority', () => {
      const viewers = getViewersForFile('photo.png')
      expect(viewers[0].id).toBe('image')
    })

    it('returns markdown viewer for .md files sorted by priority', () => {
      const viewers = getViewersForFile('README.md')
      expect(viewers[0].id).toBe('markdown')
    })

    it('returns only monaco for unknown text file', () => {
      const viewers = getViewersForFile('data.txt')
      expect(viewers).toHaveLength(1)
      expect(viewers[0].id).toBe('monaco')
    })
  })

  describe('getDefaultViewer', () => {
    it('returns highest priority viewer', () => {
      const viewer = getDefaultViewer('image.png')
      expect(viewer?.id).toBe('image')
    })

    it('returns monaco as default for code files', () => {
      const viewer = getDefaultViewer('app.ts')
      expect(viewer?.id).toBe('monaco')
    })
  })

  describe('isTextContent', () => {
    it('returns true for empty content', () => {
      expect(isTextContent('')).toBe(true)
    })

    it('returns true for plain ASCII text', () => {
      expect(isTextContent('Hello, World!\nThis is a test.')).toBe(true)
    })

    it('returns false for content with null bytes', () => {
      expect(isTextContent('binary\0content')).toBe(false)
    })

    it('returns true for text with common whitespace', () => {
      expect(isTextContent('line1\nline2\ttab\rcarriage')).toBe(true)
    })

    it('returns false for mostly non-printable content', () => {
      // More than 10% non-printable characters
      const nonPrintable = `${String.fromCharCode(1).repeat(20)  }abc`
      expect(isTextContent(nonPrintable)).toBe(false)
    })

    it('returns true for content with extended ASCII characters', () => {
      expect(isTextContent('café résumé')).toBe(true)
    })

    it('returns true for content with Unicode characters (emoji, CJK)', () => {
      expect(isTextContent('Hello 🌍 世界 こんにちは')).toBe(true)
    })
  })
})
