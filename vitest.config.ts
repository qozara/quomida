import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'apps/webapp/tests/e2e/**/*']
  },
  resolve: {
    alias: {
      '@quomida/domain-core': path.resolve(__dirname, 'packages/domain-core/src/index.ts'),
      '@quomida/sync-adapters': path.resolve(__dirname, 'packages/sync-adapters/src/index.ts'),
      '@quomida/llm-engine': path.resolve(__dirname, 'packages/llm-engine/src/index.ts'),
      '@quomida/i18n-locales': path.resolve(__dirname, 'packages/i18n-locales/src/index.ts')
    }
  }
});
