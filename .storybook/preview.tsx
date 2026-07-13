import React from 'react'
import type { Preview } from '@storybook/react'
import '../src/renderer/index.css'
import { installElectronMocks } from './electronMocks'

// Install mocks before any story renders
installElectronMocks()

// Add e2e-stable class for deterministic rendering (disables animations)
document.body.classList.add('e2e-stable')

// Pin the theme explicitly. Dark is already the unconditional :root default, so
// this is belt-and-braces — but it is also the defence against a future
// `prefers-color-scheme` rule leaking in: the headless Chromium that captures these
// screenshots reports `light` by default, and a media query would silently repaint
// all 264 references at once.
document.documentElement.dataset.theme = 'dark'

// The body still needs a background — the iframe is what gets screenshotted, and
// anything outside a story's own wrapper would otherwise be browser-default white.
// Read it from the tokens rather than a hardcoded hex, so a themed story themes the
// body too.
document.body.style.backgroundColor = 'rgb(var(--color-bg-primary))'
document.body.style.color = 'rgb(var(--color-text-primary))'

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
