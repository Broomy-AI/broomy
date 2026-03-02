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
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/renderer/main.tsx',
        'src/main/index.ts',
        'src/preload/index.ts',
        'src/renderer/vite-env.d.ts',
        'src/preload/apis/types.ts',
        'src/renderer/types/review.ts',
        'src/renderer/components/newSession/types.ts',
        'src/renderer/components/explorer/types.ts',
        'src/renderer/components/AuthTerminal.tsx',
        'src/renderer/types/analysis.ts',
        'src/renderer/components/review/checks/ChecksSection.tsx',
        'src/renderer/components/review/analyses/AnalysesSection.tsx',
        'src/renderer/components/review/walkthrough/WalkthroughSection.tsx',
        'src/renderer/components/review/walkthrough/useWalkthroughData.ts',
        'src/renderer/components/review/analyses/useAnalysesData.ts',
        'src/renderer/components/fileViewers/HtmlViewer.tsx',
        'src/renderer/components/RepoSettingsEditor.tsx',
        'src/renderer/components/review/index.tsx',
        'src/renderer/components/explorer/index.tsx',
        'src/renderer/components/explorer/SCWorkingView.tsx',
        'src/renderer/components/explorer/SourceControl.tsx',
        'src/preload/apis/shell.ts',
      ],
      thresholds: {
        lines: 90,
      },
    },
  },
})
