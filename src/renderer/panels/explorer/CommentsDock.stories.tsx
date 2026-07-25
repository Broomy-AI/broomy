/**
 * Storybook stories for CommentsDock component showcasing empty state,
 * comments with navigation, and disabled submit state.
 */
import type { Meta, StoryObj } from '@storybook/react'
import { useEffect } from 'react'
import CommentsDock from './CommentsDock'
import { useCommentsStore, type Comment } from '../../store/comments'

const DIR = '/repo'
const seed = (comments: Comment[]) => {
  useCommentsStore.setState({ commentsByDir: { [DIR]: comments } })
}

const meta: Meta<typeof CommentsDock> = {
  title: 'Explorer/CommentsDock',
  component: CommentsDock,
  decorators: [(Story, ctx) => {
    useEffect(() => { seed((ctx.parameters.seed as Comment[]) ?? []) }, [ctx.parameters.seed])
    return <div style={{ width: 320 }}><Story /></div>
  }],
}
export default meta
type Story = StoryObj<typeof CommentsDock>

export const Empty: Story = {
  args: { directory: DIR, agentPtyId: 'pty1', onNavigate: () => {} },
  parameters: { seed: [] },
}

export const WithComments: Story = {
  args: { directory: DIR, agentPtyId: 'pty1', onNavigate: () => {} },
  parameters: { seed: [
    { id: 'c1', file: '/repo/src/a.ts', line: 42, quotedText: 'const x = 1', body: 'Why 1 and not a constant?', createdAt: 't' },
    { id: 'c2', file: '/repo/src/b.ts', line: 7, quotedText: 'return null', body: 'Add a test for the null path', createdAt: 't' },
  ] },
}

export const NoAgent: Story = {
  args: { directory: DIR, agentPtyId: undefined, onNavigate: () => {} },
  parameters: { seed: [
    { id: 'c1', file: '/repo/src/a.ts', line: 42, quotedText: 'const x = 1', body: 'Why 1?', createdAt: 't' },
  ] },
}
