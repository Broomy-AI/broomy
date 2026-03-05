// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '../../../test/react-setup'
import { WebviewViewer } from './WebviewViewer'

describe('WebviewViewer', () => {
  describe('plugin config', () => {
    it('has correct id and priority', () => {
      expect(WebviewViewer.id).toBe('webview')
      expect(WebviewViewer.priority).toBe(100)
    })

    it('canHandle returns true for https URLs', () => {
      expect(WebviewViewer.canHandle('https://github.com/org/repo/pull/1')).toBe(true)
      expect(WebviewViewer.canHandle('https://example.com')).toBe(true)
    })

    it('canHandle returns false for non-URL paths', () => {
      expect(WebviewViewer.canHandle('/path/to/file.ts')).toBe(false)
      expect(WebviewViewer.canHandle('src/index.ts')).toBe(false)
      expect(WebviewViewer.canHandle('http://insecure.com')).toBe(false)
    })
  })

  describe('component', () => {
    const Component = WebviewViewer.component

    it('renders navigation bar with URL', () => {
      render(<Component filePath="https://github.com/org/repo" content="" />)
      expect(screen.getByText('https://github.com/org/repo')).toBeTruthy()
    })

    it('renders navigation buttons', () => {
      const { container } = render(<Component filePath="https://github.com/org/repo" content="" />)
      expect(container.querySelector('[title="Go back"]')).toBeTruthy()
      expect(container.querySelector('[title="Go forward"]')).toBeTruthy()
      expect(container.querySelector('[title="Reload"]')).toBeTruthy()
      expect(container.querySelector('[title="Open in browser"]')).toBeTruthy()
    })

    it('opens external link when Open in browser is clicked', () => {
      const { container } = render(<Component filePath="https://github.com/org/repo" content="" />)
      const btn = container.querySelector('[title="Open in browser"]')!
      fireEvent.click(btn)
      expect(window.shell.openExternal).toHaveBeenCalledWith('https://github.com/org/repo')
    })
  })
})
