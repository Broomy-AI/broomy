import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  // Ignore build outputs
  { ignores: ['dist/**', 'out/**', 'node_modules/**'] },

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript strict + stylistic rules (best-practice)
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,

  // React hooks rules
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off',
    },
  },

  // Project-wide settings
  {
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
    },
    rules: {
      // Already enforced by tsconfig
      '@typescript-eslint/no-unused-vars': 'off',

      // Codebase uses `type` consistently; many types use unions/intersections
      // that can't be expressed as interfaces
      '@typescript-eslint/consistent-type-definitions': 'off',

      // Allow empty functions (event handlers, catch blocks)
      '@typescript-eslint/no-empty-function': 'off',

      // Allow non-null assertions - common in Electron/React code
      '@typescript-eslint/no-non-null-assertion': 'off',

      // Allow control characters in regex - needed for ANSI escape code parsing
      'no-control-regex': 'off',
    },
  },

  // Relax rules for test files
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'src/test/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
