import { defineConfig } from 'vitest/config';

export default defineConfig({ test: {
  fileParallelism: false,
  projects: [
    { test: { name: 'unit', include: ['test/**/*.test.ts'], environment: 'node' } },
    { test: { name: 'private', include: ['test-private/**/*.test.ts'], environment: 'node', testTimeout: 30000 } },
  ],
} });
