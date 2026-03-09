import type { Meta, StoryObj } from '@storybook/react'
import { MarkdownViewer } from './MarkdownViewer'

const MarkdownViewerComponent = MarkdownViewer.component

const meta: Meta<typeof MarkdownViewerComponent> = {
  title: 'FileViewer/MarkdownViewer',
  component: MarkdownViewerComponent,
  decorators: [
    (Story) => (
      <div className="bg-bg-primary text-text-primary" style={{ width: 800, height: 600 }}>
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof MarkdownViewerComponent>

export const BasicMarkdown: Story = {
  args: {
    filePath: '/Users/test/projects/my-app/README.md',
    content: `# My Project

A description of the project.

## Getting Started

Install dependencies:

\`\`\`bash
npm install
\`\`\`

## Usage

Import and use the module:

\`\`\`typescript
import { MyModule } from './my-module'
const result = MyModule.create()
\`\`\`

## Features

- Feature one
- Feature two
- Feature three

## Links

[Documentation](https://example.com)
`,
  },
}

export const WithTable: Story = {
  args: {
    filePath: '/Users/test/projects/my-app/CHANGELOG.md',
    content: `# Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-01-01 | Initial release |
| 1.1.0 | 2024-02-01 | Added feature X |
| 1.2.0 | 2024-03-01 | Bug fixes |

## Details

Some additional details about the changelog.
`,
  },
}

export const WithBlockquote: Story = {
  args: {
    filePath: '/Users/test/projects/my-app/NOTES.md',
    content: `# Notes

> **Important:** This is a critical note about the project.
> It spans multiple lines.

> **Tip:** You can use blockquotes for tips too.

Regular text after the blockquote.
`,
  },
}

export const EmptyContent: Story = {
  args: {
    filePath: '/Users/test/projects/my-app/EMPTY.md',
    content: '',
  },
}

export const WithTaskList: Story = {
  args: {
    filePath: '/Users/test/projects/my-app/TODO.md',
    content: `# TODO

- [x] Set up project structure
- [x] Add build system
- [ ] Write tests
- [ ] Add documentation
- [ ] Deploy to production
`,
  },
}
