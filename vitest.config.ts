import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'apps/webapp/tests/e2e/**/*']
  },
  resolve: {
    alias: {
      '@quomida/domain-core': path.resolve(__dirname, 'packages/domain-core/dist/index.js'),
      '@quomida/sync-adapters': path.resolve(__dirname, 'packages/sync-adapters/dist/index.js'),
      '@quomida/llm-engine': path.resolve(__dirname, 'packages/llm-engine/dist/index.js'),
      '@quomida/i18n-locales': path.resolve(__dirname, 'packages/i18n-locales/dist/index.js')
    }
  }
});
