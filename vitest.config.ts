import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/renderer/utils/slugify.ts',
        'src/renderer/components/fileViewers/types.ts',
        'src/renderer/panels/types.ts',
        'src/renderer/utils/terminalBufferRegistry.ts',
        'src/renderer/panels/registry.ts',
        'src/renderer/store/errors.ts',
        'src/renderer/utils/claudeOutputParser.ts',
        'src/renderer/store/agents.ts',
        'src/renderer/store/profiles.ts',
        'src/renderer/store/repos.ts',
        'src/renderer/store/sessions.ts',
      ],
      thresholds: {
        lines: 90,
      },
    },
  },
})
