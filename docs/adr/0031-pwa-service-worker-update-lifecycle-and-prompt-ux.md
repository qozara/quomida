# 0031. Event-Driven PWA Service Worker Update Lifecycle, Prompt Toast & Manual Settings Check

* Status: accepted
* Date: 2026-10-24

## Context and Problem Statement

Quomida is installed on mobile devices (iOS Safari and Android Chrome) as a standalone Home Screen Progressive Web App (PWA). Two operational challenges arise with standard PWA update configurations on mobile devices:

1. **Mobile Background Suspension (`visibilitychange` Gap)**: On mobile operating systems, users rarely quit Home Screen PWAs; instead, they swipe home and suspend the app in the background. Because Quomida is a Single Page Application (SPA) where switching tabs (`Diary`, `Analytics`, `My Foods`, `Settings`) does not trigger a browser network navigation, a suspended PWA resumed days later will not automatically check the server for a new `/sw.js` unless explicitly triggered. At the same time, running background polling loops (`setInterval`) wastes battery and CPU threads.
2. **Disruptive `autoUpdate` vs. Controlled `prompt` Activation**: With `registerType: 'autoUpdate'` (`skipWaiting` + `clientsClaim`), a newly installed Service Worker immediately takes control in the background while the open browser tab still holds the previous JavaScript bundle in memory, or triggers an unexpected reload while a user is mid-way through logging a meal, configuring AI keys, or executing an RxDB cloud sync. Furthermore, users and maintainers lacked a deterministic way in the UI to manually verify or force an application update immediately after a production deployment.

## Decision Outcome

We adopt a **Three-Trigger Event-Driven PWA Update Lifecycle** using `vite-plugin-pwa` (`registerType: 'prompt'`) and a shared reactive state manager (`usePwaUpdate.ts`):

1. **Trigger 1 — Zero-Polling Foreground Resume Check (`visibilitychange`)**:
   - `registerPwaServiceWorker()` in `apps/webapp/src/hooks/usePwaUpdate.ts` listens to the native `document.visibilitychange` event.
   - When `document.visibilityState === 'visible'` and `navigator.onLine !== false`, if at least `VISIBILITY_UPDATE_COOLDOWN_MS` (1 hour) has elapsed since the last check, it invokes `registration.update()`.
   - Zero background timers or worker threads run while the app is idle or suspended.

2. **Trigger 2 — Non-Disruptive Update Prompt Toast (`PwaUpdatePrompt.tsx`)**:
   - `apps/webapp/vite.config.ts` is configured with `registerType: 'prompt'`.
   - When a new Service Worker finishes downloading and enters the `waiting` state (`onNeedRefresh`), `PwaUpdatePrompt` renders an accessible (`role="status"`, `aria-live="polite"`) non-blocking banner above the bottom navigation bar.
   - The user can tap **"Update & Reload"** (which sends `SKIP_WAITING` and reloads the page cleanly) or dismiss the toast (**"Later"**) without interrupting in-flight meal logging or sync operations.

3. **Trigger 3 — Manual "Check for App Update" Control in Settings (`SettingsModal.tsx`)**:
   - Inside the **About & Legal** section of `SettingsModal.tsx`, directly beneath the `Version <commit-hash>` display, a **"Check for App Update"** button allows users to deterministically query `registration.update()` on demand.
   - If a waiting Service Worker is detected or finishes installing during the check, the button transitions into an **"Update & Reload Now"** action; otherwise, it confirms *"Quomida is up to date"*.

## Consequences

### Positive
- **Zero Background CPU/Battery Overhead**: Updates are checked strictly on cold start, foreground app resume (`visibilitychange` with 1-hour throttle), or explicit user request in Settings.
- **Data Integrity & UX Safety**: Switching to `registerType: 'prompt'` prevents mid-session reloads or cache invalidation while RxDB transactions or Google Sheets syncs are active.
- **Deterministic Post-Deployment Verification**: Users on mobile Home Screen PWAs can immediately pull and apply hotfixes via Settings without clearing browser storage or reinstalling the PWA.
- **WCAG 2.2 & Bilingual Compliance**: All update prompts and buttons enforce `44x44px` minimum touch targets, `aria-live="polite"` status announcements, and 100% EN/ES dictionary parity in `@quomida/i18n-locales`.
