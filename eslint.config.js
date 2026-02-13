import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  // Ignore build outputs
  { ignores: ['dist/**', 'out/**', 'node_modules/**'] },

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript strict + stylistic rules (type-checked)
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

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
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
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

      // Preload bridge types use `any` extensively; fixing requires massive
      // type annotation effort across the entire IPC boundary
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',

      // Too noisy for React event handlers that commonly return void
      '@typescript-eslint/no-confusing-void-expression': 'off',

      // React event handlers are commonly async; JSX onClick etc. expect void
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],

      // Allow numbers and booleans in template literals
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true, allowBoolean: true }],

      // Converting || to ?? changes semantics for empty strings and 0;
      // requires case-by-case review
      '@typescript-eslint/prefer-nullish-coalescing': 'off',

      // --- Size & complexity limits ---
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 200, skipBlankLines: true, skipComments: true }],
      'max-depth': ['error', 5],
      'max-params': ['error', 5],
      'complexity': ['error', 25],

      // --- Additional strictness ---
      'eqeqeq': ['error', 'always'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-wrappers': 'error',
      'no-throw-literal': 'error',
      'prefer-template': 'error',
    },
  },

  // Relax rules for test files
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'src/test/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'max-lines': 'off',
      'max-lines-per-function': 'off',
    },
  },
)
