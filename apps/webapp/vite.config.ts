import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@quomida/domain-core': path.resolve(__dirname, '../../packages/domain-core/dist/index.js'),
      '@quomida/sync-adapters': path.resolve(__dirname, '../../packages/sync-adapters/dist/index.js'),
      '@quomida/llm-engine': path.resolve(__dirname, '../../packages/llm-engine/dist/index.js'),
      '@quomida/i18n-locales': path.resolve(__dirname, '../../packages/i18n-locales/dist/index.js')
    }
  },
  server: {
    port: 3000
  }
});
