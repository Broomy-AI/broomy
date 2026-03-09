import type { StorybookConfig } from '@storybook/react-vite'
import { resolve } from 'path'
import type { Plugin } from 'vite'

/**
 * Process shim plugin copied from electron.vite.config.ts.
 * Monaco editor references process.cwd(), process.platform, and process.arch
 * which are undefined in a pure browser context.
 */
function processShimPlugin(): Plugin {
  const shimCode = `\
if (typeof globalThis.process === 'undefined') {
  globalThis.process = { env: {}, platform: 'browser', arch: 'x64', cwd: () => '/' };
} else if (typeof globalThis.process.cwd !== 'function') {
  globalThis.process.cwd = () => '/';
}
`
  return {
    name: 'process-shim',
    transformIndexHtml(html) {
      return html.replace('<head>', `<head><script>${shimCode}</script>`)
    },
  }
}

const config: StorybookConfig = {
  stories: ['../src/renderer/**/*.stories.tsx'],
  framework: '@storybook/react-vite',
  addons: [],
  viteFinal: async (config) => {
    config.resolve = config.resolve || {}
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': resolve(import.meta.dirname, '../src/renderer'),
    }
    config.plugins = config.plugins || []
    config.plugins.push(processShimPlugin())
    config.css = config.css || {}
    config.css.postcss = {
      plugins: [
        (await import('tailwindcss')).default({
          config: resolve(import.meta.dirname, '../tailwind.config.js'),
        }),
        (await import('autoprefixer')).default(),
      ],
    }
    return config
  },
}

export default config
