import type { Meta, StoryObj } from '@storybook/react'
import { AgentChatMessage } from './AgentChatMessage'
import type { AgentSdkMessage } from '../../../shared/agentSdkTypes'

const meta: Meta<typeof AgentChatMessage> = {
  title: 'Agent/AgentChatMessage',
  component: AgentChatMessage,
  decorators: [(Story) => <div className="bg-[#1a1a1a] p-4 max-w-2xl"><Story /></div>],
}
export default meta
type Story = StoryObj<typeof AgentChatMessage>

const textMsg: AgentSdkMessage = {
  id: 'msg-1',
  type: 'text',
  timestamp: Date.now(),
  text: "I'll analyze the codebase and fix the authentication bug. Let me start by reading the relevant files.\n\n**Key findings:**\n- The token validation logic has a race condition\n- Session expiry is not being checked correctly\n\nLet me fix this now.",
}

export const TextMessage: Story = {
  args: { msg: textMsg },
}

export const UserMessage: Story = {
  args: {
    msg: { id: 'user-1', type: 'text', timestamp: Date.now(), text: 'Fix the authentication bug in auth.py' },
    isUserMessage: true,
  },
}

export const ToolUse: Story = {
  args: {
    msg: {
      id: 'msg-2',
      type: 'tool_use',
      timestamp: Date.now(),
      toolName: 'Read',
      toolInput: { file_path: '/src/auth/middleware.ts', limit: 100 },
      toolUseId: 'tu-1',
    },
  },
}

export const ToolResult: Story = {
  args: {
    msg: {
      id: 'msg-3',
      type: 'tool_result',
      timestamp: Date.now(),
      toolUseId: 'tu-1',
      toolResult: 'import { verify } from "jsonwebtoken"\n\nexport function authMiddleware(req, res, next) {\n  const token = req.headers.authorization?.split(" ")[1]\n  if (!token) return res.status(401).json({ error: "No token" })\n  // BUG: not checking expiry\n  const decoded = verify(token, SECRET)\n  req.user = decoded\n  next()\n}',
    },
  },
}

export const ToolResultError: Story = {
  args: {
    msg: {
      id: 'msg-4',
      type: 'tool_result',
      timestamp: Date.now(),
      toolUseId: 'tu-2',
      toolResult: 'Error: File not found: /src/auth/config.ts',
      isError: true,
    },
  },
}

export const SystemMessage: Story = {
  args: {
    msg: {
      id: 'msg-5',
      type: 'system',
      timestamp: Date.now(),
      text: 'Session initialized (model: claude-sonnet-4-20250514)',
    },
  },
}

export const ResultMessage: Story = {
  args: {
    msg: {
      id: 'msg-6',
      type: 'result',
      timestamp: Date.now(),
      result: 'Fixed the authentication bug by adding token expiry validation in the middleware. The `verify()` call now includes `{ maxAge: "1h" }` to enforce expiration.',
      costUsd: 0.0234,
      durationMs: 15200,
      numTurns: 4,
    },
  },
}

export const ErrorMessage: Story = {
  args: {
    msg: {
      id: 'msg-7',
      type: 'error',
      timestamp: Date.now(),
      text: 'Rate limit exceeded. Please try again in 30 seconds.',
    },
  },
}
