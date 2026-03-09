import type { Meta, StoryObj } from '@storybook/react'
import { CollapsibleSection } from './CollapsibleSection'

const meta: Meta<typeof CollapsibleSection> = {
  title: 'Review/CollapsibleSection',
  component: CollapsibleSection,
  decorators: [
    (Story) => (
      <div className="bg-bg-secondary text-text-primary" style={{ width: 400 }}>
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof CollapsibleSection>

export const Collapsed: Story = {
  args: {
    title: 'Code Quality',
    defaultOpen: false,
    children: (
      <div className="text-sm text-text-secondary">
        <p>All checks passed. No issues found.</p>
      </div>
    ),
  },
}

export const Expanded: Story = {
  args: {
    title: 'Code Quality',
    defaultOpen: true,
    children: (
      <div className="text-sm text-text-secondary space-y-2">
        <p>Found 3 issues:</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>Unused variable in auth.ts:42</li>
          <li>Missing error handling in login.tsx:15</li>
          <li>Duplicate import in utils.ts:3</li>
        </ul>
      </div>
    ),
  },
}

export const WithCount: Story = {
  args: {
    title: 'Warnings',
    count: 5,
    defaultOpen: false,
    children: (
      <div className="text-sm text-text-secondary">
        <p>5 warnings found in the codebase.</p>
      </div>
    ),
  },
}

export const WithCountExpanded: Story = {
  args: {
    title: 'Warnings',
    count: 5,
    defaultOpen: true,
    children: (
      <div className="text-sm text-text-secondary space-y-1">
        <p>Warning 1: Deprecated API usage</p>
        <p>Warning 2: Large bundle size</p>
        <p>Warning 3: Missing accessibility labels</p>
        <p>Warning 4: Inefficient query pattern</p>
        <p>Warning 5: Unused CSS class</p>
      </div>
    ),
  },
}

export const ZeroCount: Story = {
  args: {
    title: 'Errors',
    count: 0,
    defaultOpen: false,
    children: (
      <div className="text-sm text-text-secondary">
        <p>No errors found.</p>
      </div>
    ),
  },
}

export const MultipleSections: Story = {
  render: () => (
    <div>
      <CollapsibleSection title="Overview" defaultOpen>
        <div className="text-sm text-text-secondary">
          <p>This PR adds authentication support.</p>
        </div>
      </CollapsibleSection>
      <CollapsibleSection title="Code Quality" count={2} defaultOpen={false}>
        <div className="text-sm text-text-secondary">
          <p>2 minor issues found.</p>
        </div>
      </CollapsibleSection>
      <CollapsibleSection title="Security" count={0} defaultOpen={false}>
        <div className="text-sm text-text-secondary">
          <p>No security issues.</p>
        </div>
      </CollapsibleSection>
      <CollapsibleSection title="Performance" defaultOpen={false}>
        <div className="text-sm text-text-secondary">
          <p>No performance regressions detected.</p>
        </div>
      </CollapsibleSection>
    </div>
  ),
}
