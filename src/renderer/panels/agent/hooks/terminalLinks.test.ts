// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { createLinkWiring } from './terminalLinks'
import { allowConsoleError } from '../../../../test/console-guard'

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: class MockWebLinksAddon {
    constructor(
      public handler?: (event: MouseEvent, uri: string) => void,
      public options?: { hover?: (event: MouseEvent, uri: string) => void; leave?: () => void },
    ) {}
  },
}))

/** Both modifiers, so the assertion holds whichever platform the test runs on. */
const MODIFIED_CLICK = { button: 0, metaKey: true, ctrlKey: true, clientX: 1, clientY: 2 } as MouseEvent
const CWD = '/repo/worktree'

describe('createLinkWiring', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    vi.mocked(window.shell.openExternal).mockReset().mockResolvedValue(undefined)
    vi.mocked(window.shell.openPath).mockReset().mockResolvedValue({ action: 'opened' })
  })

  it('wires both of xterm\'s link paths, delivering non-http OSC 8 to the handler', () => {
    const links = createLinkWiring(container, CWD, true)

    expect(links.addon).toBeInstanceOf(WebLinksAddon)
    expect(links.linkHandler.allowNonHttpProtocols).toBe(true) // host terminal → file:// reaches us

    links.linkHandler.activate(MODIFIED_CLICK, 'https://osc8.example', undefined as never)
    expect(window.shell.openExternal).toHaveBeenCalledExactlyOnceWith('https://osc8.example')
  })

  it('opens a file:// OSC 8 link via shell.openPath with the decoded path + cwd', () => {
    const links = createLinkWiring(container, CWD, true)
    links.linkHandler.activate(MODIFIED_CLICK, 'file:///Users/a%20b.png', undefined as never)
    expect(window.shell.openPath).toHaveBeenCalledExactlyOnceWith('/Users/a b.png', CWD)
    expect(window.shell.openExternal).not.toHaveBeenCalled()
  })

  it('refuses file:// on an isolated terminal (allowFileUris false)', () => {
    const links = createLinkWiring(container, CWD, false)
    expect(links.linkHandler.allowNonHttpProtocols).toBe(false)
    links.linkHandler.activate(MODIFIED_CLICK, 'file:///Users/x.png', undefined as never)
    expect(window.shell.openPath).not.toHaveBeenCalled()
  })

  it('reads the hovered row from the attached terminal, so a truthful label needs no hint detail', () => {
    const links = createLinkWiring(container, CWD, true)
    const hintShow = vi.spyOn(links.hint, 'show')
    const line = { translateToString: vi.fn(() => '[image]/Users/x.png (2KB)') }
    links.attachTerminal({ buffer: { active: { getLine: vi.fn(() => line) } } } as never)

    const event = { clientX: 1, clientY: 2 } as MouseEvent
    links.linkHandler.hover!(event, 'file:///Users/x.png', { start: { x: 1, y: 5 }, end: { x: 20, y: 5 } })
    expect(hintShow).toHaveBeenLastCalledWith(event, undefined) // row shows it → no repeat

    line.translateToString.mockReturnValue('[image]/safe.png') // label lies about the target
    links.linkHandler.hover!(event, 'file:///Users/x.png', { start: { x: 1, y: 5 }, end: { x: 20, y: 5 } })
    expect(hintShow).toHaveBeenLastCalledWith(event, '/Users/x.png')
  })

  it('mounts a hint the addon can drive, and removes it on dispose', () => {
    const links = createLinkWiring(container, CWD, true)
    const addon = links.addon as unknown as {
      options?: { hover?: (e: MouseEvent, uri: string) => void; leave?: () => void }
    }

    const hint = container.querySelector<HTMLElement>('.xterm-hover')
    expect(hint!.style.display).toBe('none')

    addon.options!.hover!(MODIFIED_CLICK, 'https://text.example')
    expect(hint!.style.display).toBe('')
    addon.options!.leave!()
    expect(hint!.style.display).toBe('none')

    links.dispose()
    expect(container.querySelector('.xterm-hover')).toBeNull()
  })

  it('logs a failed external open instead of leaving an unhandled rejection', async () => {
    allowConsoleError()
    vi.mocked(window.shell.openExternal).mockRejectedValue(new Error('no browser'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const links = createLinkWiring(container, CWD, true)

    links.linkHandler.activate(MODIFIED_CLICK, 'https://example.com', undefined as never)
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalled())

    expect(consoleError.mock.calls[0][0]).toContain('failed to open link')
    consoleError.mockRestore()
  })

  it('surfaces a RESOLVED openPath failure (it does not reject) and an IPC rejection', async () => {
    allowConsoleError()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    // openPath resolves { action: 'failed', error } rather than rejecting.
    vi.mocked(window.shell.openPath).mockResolvedValueOnce({ action: 'failed', error: 'no app' })
    const links = createLinkWiring(container, CWD, true)
    links.linkHandler.activate(MODIFIED_CLICK, 'file:///Users/x.png', undefined as never)
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalled())
    expect(consoleError.mock.calls.at(-1)![1]).toBe('no app')

    // And a rejected IPC call is caught, not left unhandled.
    vi.mocked(window.shell.openPath).mockRejectedValueOnce(new Error('ipc down'))
    links.linkHandler.activate(MODIFIED_CLICK, 'file:///Users/y.png', undefined as never)
    await vi.waitFor(() => expect(consoleError.mock.calls.length).toBeGreaterThan(1))

    consoleError.mockRestore()
  })
})
