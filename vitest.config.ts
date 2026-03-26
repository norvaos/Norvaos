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
    coverage: {
      provider: 'v8',
      enabled: false, // Enable via CLI: vitest run --coverage
      include: ['lib/services/**/*.ts', 'lib/utils/**/*.ts'],
      exclude: [
        '**/__tests__/**',
        '**/node_modules/**',
        '**/*.d.ts',
      ],
      thresholds: {
        // Global minimum
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
      reporter: ['text', 'text-summary', 'html', 'json-summary'],
      reportsDirectory: './coverage',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
