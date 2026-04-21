import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'coverage/',
        '**/*.test.ts',
        '**/*.spec.ts',
        'tests/helpers/*',
      ],
    },
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
      '@/ports': new URL('./src/ports', import.meta.url).pathname,
      '@/domain': new URL('./src/domain', import.meta.url).pathname,
      '@/services': new URL('./src/services', import.meta.url).pathname,
      '@/adapters': new URL('./src/adapters', import.meta.url).pathname,
    },
  },
})