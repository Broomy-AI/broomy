/**
 * React-specific test setup that extends the base Vitest mocks with DOM assertions.
 *
 * Imports the base setup.ts to get all window.* API mocks, then registers the
 * jest-dom matchers from @testing-library (toBeVisible, toHaveTextContent, etc.)
 * so they work with Vitest's expect(). Use this setup file for tests that render
 * React components and need DOM-level assertions.
 */
import './setup'
import '@testing-library/jest-dom/vitest'
