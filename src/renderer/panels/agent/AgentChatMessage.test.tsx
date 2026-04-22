// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import { AgentChatMessage, ToolGroupBlock } from './AgentChatMessage'
import type { AgentSdkMessage } from '../../../shared/agentSdkTypes'

afterEach(() => { cleanup() })

describe('AgentChatMessage', () => {
  it('renders text messages as markdown', () => {
    const msg: AgentSdkMessage = {
      id: 'msg-1', type: 'text', timestamp: Date.now(),
      text: 'Hello **world**',
    }
    render(<AgentChatMessage msg={msg} />)
    expect(screen.getByText('world')).toBeTruthy()
    // Bold should be rendered
    const bold = screen.getByText('world')
    expect(bold.tagName).toBe('STRONG')
  })

  it('renders user messages right-aligned', () => {
    const msg: AgentSdkMessage = {
      id: 'user-1', type: 'text', timestamp: Date.now(),
      text: 'My prompt',
    }
    const { container } = render(<AgentChatMessage msg={msg} isUserMessage />)
    expect(container.querySelector('.justify-end')).toBeTruthy()
    expect(screen.getByText('My prompt')).toBeTruthy()
  })

  it('renders tool_use with formatted summary', () => {
    const msg: AgentSdkMessage = {
      id: 'tool-1', type: 'tool_use', timestamp: Date.now(),
      toolName: 'Read', toolInput: { file_path: '/src/index.ts' }, toolUseId: 'tu-1',
    }
    render(<AgentChatMessage msg={msg} />)
    expect(screen.getByText('Read')).toBeTruthy()
    expect(screen.getByText('/src/index.ts')).toBeTruthy()
  })

  it('renders Bash tool with command summary', () => {
    const msg: AgentSdkMessage = {
      id: 'tool-2', type: 'tool_use', timestamp: Date.now(),
      toolName: 'Bash', toolInput: { command: 'npm test' }, toolUseId: 'tu-2',
    }
    render(<AgentChatMessage msg={msg} />)
    expect(screen.getByText('Bash')).toBeTruthy()
    expect(screen.getByText('npm test')).toBeTruthy()
  })

  it('renders Grep tool with pattern summary', () => {
    const msg: AgentSdkMessage = {
      id: 'tool-3', type: 'tool_use', timestamp: Date.now(),
      toolName: 'Grep', toolInput: { pattern: 'TODO', path: 'src/' }, toolUseId: 'tu-3',
    }
    render(<AgentChatMessage msg={msg} />)
    expect(screen.getByText('Grep')).toBeTruthy()
    expect(screen.getByText('/TODO/ in src/')).toBeTruthy()
  })

  it('shows tool result inside expanded tool_use block', () => {
    const msg: AgentSdkMessage = {
      id: 'tool-1', type: 'tool_use', timestamp: Date.now(),
      toolName: 'Read', toolInput: { file_path: '/src/index.ts' }, toolUseId: 'tu-1',
    }
    const result: AgentSdkMessage = {
      id: 'res-1', type: 'tool_result', timestamp: Date.now(),
      toolUseId: 'tu-1', toolResult: 'file content here',
    }
    render(<AgentChatMessage msg={msg} toolResult={result} />)
    // Result not visible until expanded
    expect(screen.queryByText('file content here')).toBeNull()
    // Click to expand
    fireEvent.click(screen.getByText('Read'))
    expect(screen.getByText('file content here')).toBeTruthy()
    expect(screen.getByText('Output')).toBeTruthy()
  })

  it('shows error result with red styling', () => {
    const msg: AgentSdkMessage = {
      id: 'tool-1', type: 'tool_use', timestamp: Date.now(),
      toolName: 'Bash', toolInput: { command: 'exit 1' }, toolUseId: 'tu-1',
    }
    const result: AgentSdkMessage = {
      id: 'res-1', type: 'tool_result', timestamp: Date.now(),
      toolUseId: 'tu-1', toolResult: 'command failed', isError: true,
    }
    render(<AgentChatMessage msg={msg} toolResult={result} />)
    fireEvent.click(screen.getByText('Bash'))
    expect(screen.getByText('Error')).toBeTruthy()
    expect(screen.getByText('command failed')).toBeTruthy()
  })

  it('renders tool_result as null (handled by parent)', () => {
    const msg: AgentSdkMessage = {
      id: 'res-1', type: 'tool_result', timestamp: Date.now(),
      toolUseId: 'tu-1', toolResult: 'should not render',
    }
    const { container } = render(<AgentChatMessage msg={msg} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders system messages centered', () => {
    const msg: AgentSdkMessage = {
      id: 'sys-1', type: 'system', timestamp: Date.now(),
      text: 'Session initialized (model: claude-sonnet-4)',
    }
    const { container } = render(<AgentChatMessage msg={msg} />)
    expect(container.querySelector('.text-center')).toBeTruthy()
    expect(screen.getByText('Session initialized (model: claude-sonnet-4)')).toBeTruthy()
  })

  it('renders result messages with stats only (result text is shown via assistant message)', () => {
    const msg: AgentSdkMessage = {
      id: 'result-1', type: 'result', timestamp: Date.now(),
      result: 'This text should not be rendered — it duplicates the assistant message',
      durationMs: 3500, numTurns: 2,
    }
    render(<AgentChatMessage msg={msg} />)
    expect(screen.getByText('3.5s')).toBeTruthy()
    expect(screen.getByText('2 turns')).toBeTruthy()
    // Result text should NOT be rendered (it duplicates the preceding assistant message)
    expect(screen.queryByText(/This text should not be rendered/)).toBeNull()
  })

  it('renders result with no text as metadata only', () => {
    const msg: AgentSdkMessage = {
      id: 'result-2', type: 'result', timestamp: Date.now(),
      durationMs: 1000, numTurns: 1,
    }
    render(<AgentChatMessage msg={msg} />)
    expect(screen.getByText('1.0s')).toBeTruthy()
    expect(screen.getByText('1 turn')).toBeTruthy()
  })

  it('renders error messages in red', () => {
    const msg: AgentSdkMessage = {
      id: 'err-1', type: 'error', timestamp: Date.now(),
      text: 'Rate limit exceeded',
    }
    const { container } = render(<AgentChatMessage msg={msg} />)
    expect(screen.getByText('Rate limit exceeded')).toBeTruthy()
    expect(container.querySelector('.border-red-800')).toBeTruthy()
  })

  it('renders ExitPlanMode as markdown plan block', () => {
    const msg: AgentSdkMessage = {
      id: 'plan-1', type: 'tool_use', timestamp: Date.now(),
      toolName: 'ExitPlanMode',
      toolInput: {
        plan: '# My Plan\n\n## Step 1\nDo the thing',
        planFilePath: '/tmp/plan.md',
      },
      toolUseId: 'tu-plan',
    }
    render(<AgentChatMessage msg={msg} />)
    expect(screen.getByText('Plan')).toBeTruthy()
    expect(screen.getByText('My Plan')).toBeTruthy()
    expect(screen.getByText('Do the thing')).toBeTruthy()
    expect(screen.getByText('/tmp/plan.md')).toBeTruthy()
  })

  it('renders nothing for result message with only text and no stats', () => {
    const msg: AgentSdkMessage = {
      id: 'table-1', type: 'result', timestamp: Date.now(),
      result: '| Name | Value |\n|---|---|\n| foo | bar |',
    }
    const { container } = render(<AgentChatMessage msg={msg} />)
    // No stats means nothing to render — result text is shown via assistant message
    expect(container.innerHTML).toBe('')
  })
})

describe('ToolGroupBlock', () => {
  it('shows count and tool summary', () => {
    const items = [
      { msg: { id: 't1', type: 'tool_use' as const, timestamp: Date.now(), toolName: 'Read', toolInput: { file_path: '/a.ts' }, toolUseId: 'u1' } },
      { msg: { id: 't2', type: 'tool_use' as const, timestamp: Date.now(), toolName: 'Read', toolInput: { file_path: '/b.ts' }, toolUseId: 'u2' } },
      { msg: { id: 't3', type: 'tool_use' as const, timestamp: Date.now(), toolName: 'Read', toolInput: { file_path: '/c.ts' }, toolUseId: 'u3' } },
    ]
    render(<ToolGroupBlock items={items} />)
    // Shows "3 tool uses" label
    expect(screen.getByText('3 tool uses')).toBeTruthy()
    // Shows tool type summary
    expect(screen.getByText('3 Read')).toBeTruthy()
    // Individual items hidden until expanded
    expect(screen.queryByText('/a.ts')).toBeNull()
  })

  it('expands to show all items', () => {
    const items = [
      { msg: { id: 't1', type: 'tool_use' as const, timestamp: Date.now(), toolName: 'Read', toolInput: { file_path: '/a.ts' }, toolUseId: 'u1' } },
      { msg: { id: 't2', type: 'tool_use' as const, timestamp: Date.now(), toolName: 'Glob', toolInput: { pattern: '**/*.ts' }, toolUseId: 'u2' } },
    ]
    render(<ToolGroupBlock items={items} />)
    // Click to expand
    fireEvent.click(screen.getByText('2 tool uses'))
    expect(screen.getByText('/a.ts')).toBeTruthy()
  })
})
