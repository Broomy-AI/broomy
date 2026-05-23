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
    // Build-time constants are injected by electron.vite.config.ts in the real
    // app (and vitest config in unit tests). Storybook builds the renderer with
    // its own Vite config, so define them here too — otherwise any story that
    // reads them (e.g. the DEV badge) throws "__BUILD_COMMIT__ is not defined"
    // at render time. Fixed values keep screenshots deterministic.
    config.define = {
      ...config.define,
      __BUILD_COMMIT__: JSON.stringify('storybook'),
      __BUILD_TIME__: JSON.stringify('1970-01-01T00:00:00.000Z'),
    }
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
