import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@quomida/domain-core': path.resolve(__dirname, '../../packages/domain-core/src/index.ts'),
      '@quomida/sync-adapters': path.resolve(__dirname, '../../packages/sync-adapters/src/index.ts'),
      '@quomida/llm-engine': path.resolve(__dirname, '../../packages/llm-engine/src/index.ts'),
      '@quomida/i18n-locales': path.resolve(__dirname, '../../packages/i18n-locales/src/index.ts')
    }
  },
  server: {
    port: 3000
  }
});
