// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '../../../../test/react-setup'
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

    describe('navigationToken reload', () => {
      // jsdom doesn't implement <webview>, but the ref still resolves to an HTMLElement.
      // Stub loadURL on the prototype so the effect's call lands on a spy.
      afterEach(() => {
        // @ts-expect-error cleaning up the test stub
        delete HTMLElement.prototype.loadURL
      })
      function setupLoadUrlSpy() {
        const spy = vi.fn()
        // @ts-expect-error attaching a fake Electron API to the DOM prototype for the test
        HTMLElement.prototype.loadURL = spy
        return spy
      }

      it('does not call loadURL on initial mount with a token', () => {
        const spy = setupLoadUrlSpy()
        render(<Component filePath="https://example.com" content="" navigationToken={1} />)
        expect(spy).not.toHaveBeenCalled()
      })

      it('calls loadURL when navigationToken changes (re-click of same URL)', () => {
        const spy = setupLoadUrlSpy()
        const { rerender } = render(<Component filePath="https://example.com" content="" navigationToken={1} />)
        expect(spy).not.toHaveBeenCalled()
        rerender(<Component filePath="https://example.com" content="" navigationToken={2} />)
        expect(spy).toHaveBeenCalledWith('https://example.com')
      })

      it('does not call loadURL when only filePath changes (src attribute handles it)', () => {
        const spy = setupLoadUrlSpy()
        const { rerender } = render(<Component filePath="https://example.com" content="" navigationToken={1} />)
        rerender(<Component filePath="https://example.org" content="" navigationToken={1} />)
        expect(spy).not.toHaveBeenCalled()
      })

      it('treats first activation after undefined as a baseline (no reload)', () => {
        // Simulates a session becoming active: navigationToken transitions from undefined to a value.
        const spy = setupLoadUrlSpy()
        const { rerender } = render(<Component filePath="https://example.com" content="" />)
        rerender(<Component filePath="https://example.com" content="" navigationToken={5} />)
        expect(spy).not.toHaveBeenCalled()
        // Subsequent token bump while active should reload.
        rerender(<Component filePath="https://example.com" content="" navigationToken={6} />)
        expect(spy).toHaveBeenCalledWith('https://example.com')
      })
    })
  })
})
