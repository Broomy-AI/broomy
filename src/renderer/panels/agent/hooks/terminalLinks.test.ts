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

describe('createLinkWiring', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    vi.mocked(window.shell.openExternal).mockReset().mockResolvedValue(undefined)
  })

  it('wires both of xterm\'s link paths to the same gate', () => {
    const links = createLinkWiring(container)

    expect(links.addon).toBeInstanceOf(WebLinksAddon)
    expect(links.linkHandler.allowNonHttpProtocols).toBe(false)

    links.linkHandler.activate(MODIFIED_CLICK, 'https://osc8.example', undefined as never)
    expect(window.shell.openExternal).toHaveBeenCalledExactlyOnceWith('https://osc8.example')
  })

  it('mounts a hint the addon can drive, and removes it on dispose', () => {
    const links = createLinkWiring(container)
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

  it('logs a failed open instead of leaving an unhandled rejection', async () => {
    allowConsoleError()
    vi.mocked(window.shell.openExternal).mockRejectedValue(new Error('no browser'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const links = createLinkWiring(container)

    links.linkHandler.activate(MODIFIED_CLICK, 'https://example.com', undefined as never)
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalled())

    expect(consoleError.mock.calls[0][0]).toContain('failed to open link')
    consoleError.mockRestore()
  })
})
