# 0008. Service Worker PWA Application Shell & Heartbeat Connectivity Monitoring

* Status: accepted
* Date: 2026-09-14

## Context and Problem Statement

Quomida operates client-side offline workflows once loaded. However, if a user reloads (F5), opens a new browser tab, or navigates while disconnected, standard browser HTTP caching fails to reliably intercept navigation requests, resulting in standard browser network error pages (`ERR_INTERNET_DISCONNECTED`). Furthermore, network adapter status (`navigator.onLine`) alone does not guarantee actual server reachability. How should Quomida implement cold-start offline application shell caching and real-time connectivity status tracking?

## Decision Drivers

* Cold-start support: The application must load instantly from an empty tab when offline.
* Automatic asset hash management: Quomida uses Vite, which generates hashed asset filenames during build.
* Non-intrusive connectivity feedback: WCAG 2.2 compliant real-time status updates without intrusive blocking UI modals.
* Zero backend requirement: Heartbeat reachability checks must work without adding custom backend server endpoints.

## Decision Outcome

Chosen option: **`vite-plugin-pwa` with `generateSW` Strategy & Lightweight Origin Heartbeat**.

### Implementation Details

1. **PWA Service Worker Generation**: Configured `vite-plugin-pwa` in `apps/webapp/vite.config.ts` using the `generateSW` Workbox strategy:
   - Precaches critical application shell assets (`index.html`, JavaScript bundles, CSS stylesheets, SVG icons).
   - `NetworkFirst` fallback strategy for navigation requests (`navigateFallback: 'index.html'`).
   - `CacheFirst` caching strategy for static hashed assets.
   - Automatic Service Worker registration on app startup via `virtual:pwa-register`.

2. **Network Event & Heartbeat Monitoring**:
   - `AppContext` binds event listeners to `window.addEventListener('online')` and `window.addEventListener('offline')`.
   - When `navigator.onLine` is true, `AppContext` executes a periodic (30s) lightweight `HEAD` request to `/` (the origin root HTML).
   - If offline or if the `HEAD` request fails/times out, `syncStatus` reactively updates to `'disconnected'`.

3. **Accessibility (WCAG 2.2)**:
   - Header sync indicator includes an `sr-only` span element wrapped inside an `aria-live="polite"` container.
   - Uses localized strings (`appStatus.offline` / `appStatus.connected`) in English and Spanish to announce status changes without disrupting screen reader flow.

### Positive Consequences

- Cold-start offline navigation functions seamlessly across desktop and mobile browsers.
- Build-time asset hashing and service worker cache invalidation are managed automatically by `vite-plugin-pwa`.
- Users receive immediate visual and accessible audio/screen-reader feedback when connectivity drops or recovers.
