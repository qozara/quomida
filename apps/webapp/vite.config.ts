import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import sri from 'vite-plugin-sri';
import path from 'path';
import fs from 'fs';
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
        name: 'fix-sqlite-worker',
        enforce: 'pre',
        transform(code, id) {
          if (id.includes('sqlite-wasm-http/dist/index.js')) {
            return code.replace(
              /new Worker\(new URL\('\.\/sqlite-worker\.js', import\.meta\.url\)\)/g,
              "new Worker(new URL('./sqlite-worker.js', import.meta.url), { type: 'module' })"
            ).replace(
              /new Worker\(new URL\('\.\/vfs-http-worker\.js', import\.meta\.url\)\)/g,
              "new Worker(new URL('./vfs-http-worker.js', import.meta.url), { type: 'module' })"
            );
          }
        }
      },
      {
        name: 'csp-injector',
        transformIndexHtml(html) {
          return html.replace('__VITE_CSP_CATALOG_DOMAIN__', cspDomain ? ` ${cspDomain}` : '');
        }
      },
      {
        name: 'serve-etl-catalog',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url === '/catalog.sqlite' || req.url === '/catalog_meta.json') {
              const filePath = path.resolve(__dirname, '../../apps/etl-pipeline/dist-cdn', req.url.slice(1));
              if (fs.existsSync(filePath)) {
                res.setHeader('Access-Control-Allow-Origin', '*');
                if (req.url === '/catalog.sqlite') {
                  res.setHeader('Accept-Ranges', 'bytes');
                  res.setHeader('Content-Type', 'application/vnd.sqlite3');
                } else {
                  res.setHeader('Content-Type', 'application/json');
                }
                const stat = fs.statSync(filePath);
                res.setHeader('Content-Length', stat.size);
                
                // Extremely basic range support for local sqlite-wasm-http tests
                if (req.headers.range) {
                  const parts = req.headers.range.replace(/bytes=/, "").split("-");
                  const partialstart = parts[0];
                  const partialend = parts[1];
                  const start = parseInt(partialstart, 10);
                  const end = partialend ? parseInt(partialend, 10) : stat.size - 1;
                  const chunksize = (end - start) + 1;
                  res.statusCode = 206;
                  res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
                  res.setHeader('Content-Length', chunksize);
                  const stream = fs.createReadStream(filePath, { start, end });
                  stream.pipe(res);
                } else {
                  fs.createReadStream(filePath).pipe(res);
                }
                return;
              }
            }
            next();
          });
        }
      },
      react(),
      sri(),
    VitePWA({
      registerType: 'autoUpdate',
      useCredentials: true,
      includeAssets: ['favicon.ico', 'favicon.svg', 'favicon-48x48.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Quomida',
        short_name: 'Quomida',
        description: 'Privacy-First Local Calorie & Macro Tracker',
        theme_color: '#6d4aff',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          {
            src: 'icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'maskable-icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
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
  worker: {
    format: 'es'
  },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm', 'sqlite-wasm-http']
  },
  server: {
    port: 3000
  },
  preview: {
    port: 3000
  }
  };
});
