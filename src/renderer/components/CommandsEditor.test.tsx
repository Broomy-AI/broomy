// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '../../test/react-setup'
import { CommandsEditor } from './CommandsEditor'

vi.mock('./review/useReviewActions', () => ({
  checkLegacyBroomyGitignore: vi.fn().mockResolvedValue(false),
  removeLegacyBroomyGitignore: vi.fn().mockResolvedValue(undefined),
}))

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(window.fs.exists).mockResolvedValue(false)
  vi.mocked(window.fs.readFile).mockRejectedValue(new Error('not found'))
  vi.mocked(window.fs.writeFile).mockResolvedValue({ success: true })
  vi.mocked(window.fs.mkdir).mockResolvedValue({ success: true })
})

const defaultConfig = {
  version: 1,
  actions: [
    { id: 'action-1', label: 'Commit', type: 'agent', prompt: 'commit things', showWhen: ['has-changes'], style: 'primary' },
    { id: 'action-2', label: 'Push', type: 'shell', command: 'git push', showWhen: ['clean'], style: 'secondary' },
  ],
}

function mockExistingConfig() {
  vi.mocked(window.fs.exists).mockResolvedValue(true)
  vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify(defaultConfig))
}

describe('CommandsEditor', () => {
  describe('empty state', () => {
    it('shows create button when no commands.json exists', async () => {
      render(<CommandsEditor directory="/test/repo" onClose={vi.fn()} />)
      await waitFor(() => {
        expect(screen.getByTestId('create-commands')).toBeTruthy()
      })
      expect(screen.getByText('No commands.json')).toBeTruthy()
    })

    it('calls create logic when button is clicked', async () => {
      render(<CommandsEditor directory="/test/repo" onClose={vi.fn()} />)
      await waitFor(() => {
        expect(screen.getByTestId('create-commands')).toBeTruthy()
      })
      fireEvent.click(screen.getByTestId('create-commands'))
      await waitFor(() => {
        expect(window.fs.writeFile).toHaveBeenCalled()
      })
    })
  })

  describe('editor state', () => {
    it('shows action cards when config exists', async () => {
      mockExistingConfig()
      render(<CommandsEditor directory="/test/repo" onClose={vi.fn()} />)
      await waitFor(() => {
        expect(screen.getByText('Commit')).toBeTruthy()
      })
      expect(screen.getByText('Push')).toBeTruthy()
    })

    it('shows add action button', async () => {
      mockExistingConfig()
      render(<CommandsEditor directory="/test/repo" onClose={vi.fn()} />)
      await waitFor(() => {
        expect(screen.getByTestId('add-action')).toBeTruthy()
      })
    })

    it('expands action card when header is clicked', async () => {
      mockExistingConfig()
      render(<CommandsEditor directory="/test/repo" onClose={vi.fn()} />)
      await waitFor(() => {
        expect(screen.getByTestId('action-header-action-1')).toBeTruthy()
      })
      fireEvent.click(screen.getByTestId('action-header-action-1'))
      expect(screen.getByTestId('action-label-action-1')).toBeTruthy()
    })

    it('shows save button disabled when no changes', async () => {
      mockExistingConfig()
      render(<CommandsEditor directory="/test/repo" onClose={vi.fn()} />)
      await waitFor(() => {
        expect(screen.getByTestId('save-commands')).toBeTruthy()
      })
      expect(screen.getByTestId('save-commands')).toBeDisabled()
    })

    it('enables save when changes are made', async () => {
      mockExistingConfig()
      render(<CommandsEditor directory="/test/repo" onClose={vi.fn()} />)
      await waitFor(() => {
        expect(screen.getByTestId('action-header-action-1')).toBeTruthy()
      })
      // Expand and modify
      fireEvent.click(screen.getByTestId('action-header-action-1'))
      fireEvent.change(screen.getByTestId('action-label-action-1'), { target: { value: 'New Label' } })
      expect(screen.getByTestId('save-commands')).not.toBeDisabled()
    })

    it('calls onClose when close button is clicked', async () => {
      mockExistingConfig()
      const onClose = vi.fn()
      render(<CommandsEditor directory="/test/repo" onClose={onClose} />)
      await waitFor(() => {
        expect(screen.getByTestId('close-commands-editor')).toBeTruthy()
      })
      fireEvent.click(screen.getByTestId('close-commands-editor'))
      expect(onClose).toHaveBeenCalledOnce()
    })

    it('adds a new action when Add Action is clicked', async () => {
      mockExistingConfig()
      render(<CommandsEditor directory="/test/repo" onClose={vi.fn()} />)
      await waitFor(() => {
        expect(screen.getByTestId('add-action')).toBeTruthy()
      })
      fireEvent.click(screen.getByTestId('add-action'))
      expect(screen.getByText('New Action')).toBeTruthy()
    })

    it('shows delete confirmation on first click', async () => {
      mockExistingConfig()
      render(<CommandsEditor directory="/test/repo" onClose={vi.fn()} />)
      await waitFor(() => {
        expect(screen.getByTestId('action-header-action-1')).toBeTruthy()
      })
      fireEvent.click(screen.getByTestId('action-header-action-1'))
      fireEvent.click(screen.getByTestId('action-delete-action-1'))
      expect(screen.getByText('Delete this action?')).toBeTruthy()
    })

    it('saves config when save button is clicked', async () => {
      mockExistingConfig()
      render(<CommandsEditor directory="/test/repo" onClose={vi.fn()} />)
      await waitFor(() => {
        expect(screen.getByTestId('action-header-action-1')).toBeTruthy()
      })
      // Make a change to enable save
      fireEvent.click(screen.getByTestId('action-header-action-1'))
      fireEvent.change(screen.getByTestId('action-label-action-1'), { target: { value: 'Updated' } })
      fireEvent.click(screen.getByTestId('save-commands'))
      await waitFor(() => {
        expect(window.fs.writeFile).toHaveBeenCalledWith(
          '/test/repo/.broomy/commands.json',
          expect.stringContaining('Updated'),
        )
      })
    })
  })

  describe('prompt toggle', () => {
    it('defaults to inline prompt mode when action has prompt', async () => {
      mockExistingConfig()
      render(<CommandsEditor directory="/test/repo" onClose={vi.fn()} />)
      await waitFor(() => {
        expect(screen.getByTestId('action-header-action-1')).toBeTruthy()
      })
      fireEvent.click(screen.getByTestId('action-header-action-1'))
      // Inline prompt toggle should be active (accent bg)
      expect(screen.getByTestId('prompt-mode-inline-action-1')).toBeTruthy()
      expect(screen.getByTestId('action-prompt-action-1')).toBeTruthy()
      // promptFile input should not be visible
      expect(screen.queryByTestId('action-promptFile-action-1')).toBeNull()
    })

    it('defaults to file mode when only promptFile is set', async () => {
      const fileConfig = {
        version: 1,
        actions: [
          { id: 'action-f', label: 'File Action', type: 'agent', promptFile: '.broomy/prompts/test.md', showWhen: [], style: 'primary' },
        ],
      }
      vi.mocked(window.fs.exists).mockResolvedValue(true)
      vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify(fileConfig))
      render(<CommandsEditor directory="/test/repo" onClose={vi.fn()} />)
      await waitFor(() => {
        expect(screen.getByTestId('action-header-action-f')).toBeTruthy()
      })
      fireEvent.click(screen.getByTestId('action-header-action-f'))
      expect(screen.getByTestId('action-promptFile-action-f')).toBeTruthy()
      expect(screen.queryByTestId('action-prompt-action-f')).toBeNull()
    })

    it('switches between inline and file mode', async () => {
      mockExistingConfig()
      render(<CommandsEditor directory="/test/repo" onClose={vi.fn()} />)
      await waitFor(() => {
        expect(screen.getByTestId('action-header-action-1')).toBeTruthy()
      })
      fireEvent.click(screen.getByTestId('action-header-action-1'))
      // Start in inline mode
      expect(screen.getByTestId('action-prompt-action-1')).toBeTruthy()
      // Switch to file mode
      fireEvent.click(screen.getByTestId('prompt-mode-file-action-1'))
      expect(screen.getByTestId('action-promptFile-action-1')).toBeTruthy()
      expect(screen.queryByTestId('action-prompt-action-1')).toBeNull()
      // Switch back
      fireEvent.click(screen.getByTestId('prompt-mode-inline-action-1'))
      expect(screen.getByTestId('action-prompt-action-1')).toBeTruthy()
    })
  })

  describe('ShowWhenPicker', () => {
    it('shows active conditions with dropdown and remove button', async () => {
      mockExistingConfig()
      render(<CommandsEditor directory="/test/repo" onClose={vi.fn()} />)
      await waitFor(() => {
        expect(screen.getByTestId('action-header-action-1')).toBeTruthy()
      })
      fireEvent.click(screen.getByTestId('action-header-action-1'))
      expect(screen.getByTestId('show-when-picker')).toBeTruthy()
      // action-1 has showWhen: ['has-changes'], so it should show with "true" selected
      const select = screen.getByTestId<HTMLSelectElement>('condition-value-has-changes')
      expect(select.value).toBe('true')
      expect(screen.getByTestId('condition-remove-has-changes')).toBeTruthy()
    })

    it('adds a condition via the modal picker', async () => {
      mockExistingConfig()
      render(<CommandsEditor directory="/test/repo" onClose={vi.fn()} />)
      await waitFor(() => {
        expect(screen.getByTestId('action-header-action-1')).toBeTruthy()
      })
      fireEvent.click(screen.getByTestId('action-header-action-1'))
      // Open modal and add 'clean'
      fireEvent.click(screen.getByTestId('add-condition'))
      expect(screen.getByTestId('condition-modal')).toBeTruthy()
      fireEvent.click(screen.getByTestId('add-condition-clean'))
      // Modal should close, condition should appear with dropdown
      expect(screen.queryByTestId('condition-modal')).toBeNull()
      expect(screen.getByTestId('condition-value-clean')).toBeTruthy()
      // Save should be enabled
      expect(screen.getByTestId('save-commands')).not.toBeDisabled()
    })

    it('removes a condition', async () => {
      mockExistingConfig()
      render(<CommandsEditor directory="/test/repo" onClose={vi.fn()} />)
      await waitFor(() => {
        expect(screen.getByTestId('action-header-action-1')).toBeTruthy()
      })
      fireEvent.click(screen.getByTestId('action-header-action-1'))
      fireEvent.click(screen.getByTestId('condition-remove-has-changes'))
      expect(screen.queryByTestId('condition-value-has-changes')).toBeNull()
      expect(screen.getByTestId('save-commands')).not.toBeDisabled()
    })

    it('changes condition value via dropdown', async () => {
      mockExistingConfig()
      render(<CommandsEditor directory="/test/repo" onClose={vi.fn()} />)
      await waitFor(() => {
        expect(screen.getByTestId('action-header-action-1')).toBeTruthy()
      })
      fireEvent.click(screen.getByTestId('action-header-action-1'))
      const select = screen.getByTestId<HTMLSelectElement>('condition-value-has-changes')
      expect(select.value).toBe('true')
      fireEvent.change(select, { target: { value: 'false' } })
      expect(select.value).toBe('false')
      expect(screen.getByTestId('save-commands')).not.toBeDisabled()
    })
  })
})
