import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import { execSync } from 'child_process'

const gitCommit = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim() }
  catch { return 'unknown' }
})()

export default defineConfig({
  define: {
    __BUILD_COMMIT__: JSON.stringify(gitCommit),
    __BUILD_TIME__: JSON.stringify('test'),
  },
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
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.stories.{ts,tsx}',
        'src/test/**',
        'src/renderer/main.tsx',
        'src/main/index.ts',
        'src/preload/index.ts',
        'src/renderer/vite-env.d.ts',
        'src/preload/apis/types.ts',
        'src/renderer/types/review.ts',
        'src/renderer/components/newSession/types.ts',
        'src/renderer/components/explorer/types.ts',
        'src/renderer/shared/components/AuthTerminal.tsx',
        'src/renderer/shared/components/ContainerInfoPanel.tsx',
        'src/shared/agentSdkTypes.ts',
        // Agent SDK IPC handlers — need real Electron + SDK subprocess, tested via E2E
        'src/main/handlers/agentSdk.ts',
        'src/main/handlers/agentSdkHelpers.ts',
        'src/preload/apis/agentSdk.ts',
        // React hook with deep Electron IPC dependencies, tested via E2E
        'src/renderer/panels/agent/hooks/useAgentSdk.ts',
        // Root component — tested via E2E, not unit-testable
        'src/renderer/App.tsx',
        // Agent chat UI components — need full React + IPC, tested via E2E
        'src/renderer/panels/agent/AgentChat.tsx',
        'src/renderer/panels/agent/AgentChatInput.tsx',
        'src/renderer/panels/agent/AgentPermissionRequest.tsx',
        // Viewer components needing browser canvas/DOM APIs
        'src/renderer/panels/fileViewer/viewers/ImageDiffViewer.tsx',
      ],
      thresholds: {
        lines: 90,
      },
    },
  },
})
