// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '../../../test/react-setup'

// Must import after react-setup so window.fs is mocked
import { ImageViewer } from './ImageViewer'

const ImageViewerComponent = ImageViewer.component

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ImageViewer plugin', () => {
  it('has correct id and name', () => {
    expect(ImageViewer.id).toBe('image')
    expect(ImageViewer.name).toBe('Image')
  })

  it('canHandle returns true for image extensions', () => {
    expect(ImageViewer.canHandle('photo.png')).toBe(true)
    expect(ImageViewer.canHandle('photo.jpg')).toBe(true)
    expect(ImageViewer.canHandle('photo.jpeg')).toBe(true)
    expect(ImageViewer.canHandle('photo.gif')).toBe(true)
    expect(ImageViewer.canHandle('photo.webp')).toBe(true)
    expect(ImageViewer.canHandle('photo.bmp')).toBe(true)
    expect(ImageViewer.canHandle('photo.ico')).toBe(true)
    expect(ImageViewer.canHandle('photo.svg')).toBe(true)
  })

  it('canHandle returns false for non-image extensions', () => {
    expect(ImageViewer.canHandle('file.ts')).toBe(false)
    expect(ImageViewer.canHandle('file.txt')).toBe(false)
    expect(ImageViewer.canHandle('file.json')).toBe(false)
  })
})

describe('ImageViewerComponent', () => {
  it('shows loading state initially', () => {
    vi.mocked(window.fs.readFileBase64).mockReturnValue(new Promise(() => {}))
    render(<ImageViewerComponent filePath="/test/image.png" content="" />)
    expect(screen.getByText('Loading image...')).toBeTruthy()
  })

  it('renders image after loading', async () => {
    vi.mocked(window.fs.readFileBase64).mockResolvedValue('aGVsbG8=')
    render(<ImageViewerComponent filePath="/test/image.png" content="" />)
    await waitFor(() => {
      const img = screen.getByAltText('/test/image.png')
      expect(img).toBeTruthy()
      expect(img.getAttribute('src')).toBe('data:image/png;base64,aGVsbG8=')
    })
  })

  it('shows error state when loading fails', async () => {
    vi.mocked(window.fs.readFileBase64).mockRejectedValue(new Error('File not found'))
    render(<ImageViewerComponent filePath="/test/missing.png" content="" />)
    await waitFor(() => {
      expect(screen.getByText('File not found')).toBeTruthy()
    })
  })

  it('renders zoom controls', async () => {
    vi.mocked(window.fs.readFileBase64).mockResolvedValue('aGVsbG8=')
    render(<ImageViewerComponent filePath="/test/image.png" content="" />)
    await waitFor(() => {
      expect(screen.getByTitle('Zoom in')).toBeTruthy()
      expect(screen.getByTitle('Zoom out')).toBeTruthy()
      expect(screen.getByTitle('Reset zoom and position')).toBeTruthy()
      expect(screen.getByText('100%')).toBeTruthy()
    })
  })

  it('zoom in updates scale display', async () => {
    vi.mocked(window.fs.readFileBase64).mockResolvedValue('aGVsbG8=')
    render(<ImageViewerComponent filePath="/test/image.png" content="" />)
    await waitFor(() => {
      expect(screen.getByText('100%')).toBeTruthy()
    })
    fireEvent.click(screen.getByTitle('Zoom in'))
    expect(screen.getByText('125%')).toBeTruthy()
  })

  it('zoom out updates scale display', async () => {
    vi.mocked(window.fs.readFileBase64).mockResolvedValue('aGVsbG8=')
    render(<ImageViewerComponent filePath="/test/image.png" content="" />)
    await waitFor(() => {
      expect(screen.getByText('100%')).toBeTruthy()
    })
    fireEvent.click(screen.getByTitle('Zoom out'))
    expect(screen.getByText('80%')).toBeTruthy()
  })

  it('reset restores 100% zoom', async () => {
    vi.mocked(window.fs.readFileBase64).mockResolvedValue('aGVsbG8=')
    render(<ImageViewerComponent filePath="/test/image.png" content="" />)
    await waitFor(() => {
      expect(screen.getByText('100%')).toBeTruthy()
    })
    fireEvent.click(screen.getByTitle('Zoom in'))
    fireEvent.click(screen.getByTitle('Zoom in'))
    expect(screen.queryByText('100%')).toBeNull()
    fireEvent.click(screen.getByTitle('Reset zoom and position'))
    expect(screen.getByText('100%')).toBeTruthy()
  })

  it('shows drag to pan message when zoomed in', async () => {
    vi.mocked(window.fs.readFileBase64).mockResolvedValue('aGVsbG8=')
    render(<ImageViewerComponent filePath="/test/image.png" content="" />)
    await waitFor(() => {
      expect(screen.getByText('100%')).toBeTruthy()
    })
    // At 100%, no pan hint
    expect(screen.queryByText('Drag to pan')).toBeNull()
    // Zoom in past 100%
    fireEvent.click(screen.getByTitle('Zoom in'))
    expect(screen.getByText('Drag to pan')).toBeTruthy()
  })

  it('uses correct MIME type for jpeg', async () => {
    vi.mocked(window.fs.readFileBase64).mockResolvedValue('abc=')
    render(<ImageViewerComponent filePath="/test/photo.jpeg" content="" />)
    await waitFor(() => {
      const img = screen.getByAltText('/test/photo.jpeg')
      expect(img.getAttribute('src')).toBe('data:image/jpeg;base64,abc=')
    })
  })

  it('handles mouse drag when zoomed in', async () => {
    vi.mocked(window.fs.readFileBase64).mockResolvedValue('aGVsbG8=')
    const { container } = render(<ImageViewerComponent filePath="/test/image.png" content="" />)
    await waitFor(() => {
      expect(screen.getByText('100%')).toBeTruthy()
    })
    // Zoom in to enable panning
    fireEvent.click(screen.getByTitle('Zoom in'))
    fireEvent.click(screen.getByTitle('Zoom in'))

    const imageContainer = container.querySelector('.flex-1.overflow-hidden')!
    fireEvent.mouseDown(imageContainer, { clientX: 100, clientY: 100 })
    fireEvent.mouseMove(imageContainer, { clientX: 150, clientY: 150 })
    fireEvent.mouseUp(imageContainer)
    // Should not throw
  })

  it('handles mouseLeave to stop dragging', async () => {
    vi.mocked(window.fs.readFileBase64).mockResolvedValue('aGVsbG8=')
    const { container } = render(<ImageViewerComponent filePath="/test/image.png" content="" />)
    await waitFor(() => {
      expect(screen.getByText('100%')).toBeTruthy()
    })
    fireEvent.click(screen.getByTitle('Zoom in'))

    const imageContainer = container.querySelector('.flex-1.overflow-hidden')!
    fireEvent.mouseDown(imageContainer, { clientX: 100, clientY: 100 })
    fireEvent.mouseLeave(imageContainer)
    // Should not throw
  })

  it('handles Ctrl+wheel zoom', async () => {
    vi.mocked(window.fs.readFileBase64).mockResolvedValue('aGVsbG8=')
    const { container } = render(<ImageViewerComponent filePath="/test/image.png" content="" />)
    await waitFor(() => {
      expect(screen.getByText('100%')).toBeTruthy()
    })

    const imageContainer = container.querySelector('.flex-1.overflow-hidden')!
    // Zoom in with Ctrl+wheel up
    fireEvent.wheel(imageContainer, { deltaY: -100, ctrlKey: true })
    expect(screen.queryByText('100%')).toBeNull() // Scale changed from 100%
  })

  it('handles non-Error thrown during loading', async () => {
    vi.mocked(window.fs.readFileBase64).mockRejectedValue('string error')
    render(<ImageViewerComponent filePath="/test/missing.png" content="" />)
    await waitFor(() => {
      expect(screen.getByText('Failed to load image')).toBeTruthy()
    })
  })

  it('uses correct MIME type for svg', async () => {
    vi.mocked(window.fs.readFileBase64).mockResolvedValue('abc=')
    render(<ImageViewerComponent filePath="/test/icon.svg" content="" />)
    await waitFor(() => {
      const img = screen.getByAltText('/test/icon.svg')
      expect(img.getAttribute('src')).toBe('data:image/svg+xml;base64,abc=')
    })
  })
})
