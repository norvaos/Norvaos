import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    include: ['**/__tests__/**/*.test.{ts,tsx}'],
    // Use jsdom for .tsx tests, node for .ts tests
    environmentMatchGlobs: [
      ['**/__tests__/**/*.test.tsx', 'jsdom'],
      ['**/__tests__/**/*.test.ts', 'node'],
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
