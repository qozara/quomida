import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { execSync } from 'child_process';

function getGitCommitHash(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  }
  if (process.env.GITHUB_SHA) {
    return process.env.GITHUB_SHA.slice(0, 7);
  }
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(getGitCommitHash())
  },
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
