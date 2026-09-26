import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import sri from 'vite-plugin-sri';
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const cspDomain = env.VITE_CATALOG_BASE_URL ? (new URL(env.VITE_CATALOG_BASE_URL).origin) : '';

  return {
    plugins: [
      {
        name: 'csp-injector',
        transformIndexHtml(html) {
          return html.replace('__VITE_CSP_CATALOG_DOMAIN__', cspDomain ? ` ${cspDomain}` : '');
        }
      },
      react(),
      sri(),
    VitePWA({
      registerType: 'autoUpdate',
      useCredentials: true,
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Quomida',
        short_name: 'Quomida',
        description: 'Privacy-First Local Calorie & Macro Tracker',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone'
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10 MB limit
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'navigation-cache'
            }
          },
          {
            urlPattern: ({ request }) =>
              request.destination === 'style' ||
              request.destination === 'script' ||
              request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-assets-cache'
            }
          }
        ]
      }
    })
  ],
  define: {
    __APP_VERSION__: JSON.stringify(getGitCommitHash())
  },
  resolve: {
    alias: {
      '@quomida/domain-core': path.resolve(__dirname, '../../packages/domain-core/src/index.ts'),
      '@quomida/cloud-providers': path.resolve(__dirname, '../../packages/cloud-providers/src/index.ts'),
      '@quomida/llm-engine': path.resolve(__dirname, '../../packages/llm-engine/src/index.ts'),
      '@quomida/i18n-locales': path.resolve(__dirname, '../../packages/i18n-locales/src/index.ts')
    }
  },
  server: {
    port: 3000
  },
  preview: {
    port: 3000
  }
  };
});
