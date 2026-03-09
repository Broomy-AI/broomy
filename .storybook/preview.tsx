import React from 'react'
import type { Preview } from '@storybook/react'
import '../src/renderer/index.css'
import { installElectronMocks } from './electronMocks'

// Install mocks before any story renders
installElectronMocks()

// Add e2e-stable class for deterministic rendering (disables animations)
document.body.classList.add('e2e-stable')

// Set dark background on body and storybook root so components that inherit
// background color (most of them) render correctly against the dark theme.
document.body.style.backgroundColor = '#1a1a1a'
document.body.style.color = '#e0e0e0'

const preview: Preview = {
  decorators: [
    (Story) => (
      <div className="bg-bg-primary text-text-primary">
        <Story />
      </div>
    ),
  ],
  parameters: {
    backgrounds: {
      disable: true,
    },
  },
}

export default preview
