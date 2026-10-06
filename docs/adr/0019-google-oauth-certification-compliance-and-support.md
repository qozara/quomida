# 19. Google OAuth Certification Compliance, Legal & Support Architecture

Date: 2026-10-06

## Status

Accepted

## Context

To enable Google OAuth synchronization in production without unverified app consent warnings, Quomida must pass the Google OAuth App Verification and Certification process for restricted/sensitive Google Drive scopes (`https://www.googleapis.com/auth/drive.file` and `https://www.googleapis.com/auth/drive.appdata`).

Google verification guidelines strictly require:
1. Prominent in-app user access to official Terms of Service and Privacy Policy documents.
2. An explicit Google API Limited Use disclosure affirming adherence to the Google API Services User Data Policy.
3. Accessible direct developer support and legal contact channels (`support@qozara.org`, `legal@qozara.org`).
4. Transparent licensing and organizational attribution linking to Qozara Lab (`https://qozara.org`) and Quomida (`https://quomida.qozara.org`).
5. Consent-time transparency within the storage synchronization settings before connecting Google Drive.

## Decision

We aligned Quomida's presentation and legal architecture with the Qozara ecosystem pattern established in Quozen:

1. **Environment-Driven Endpoint & Support Configuration**:
   - Added `VITE_SUPPORT_EMAIL` (`support@qozara.org`), `VITE_LEGAL_EMAIL` (`legal@qozara.org`), `VITE_LEGAL_BASE_URL` (`https://qozara.org`), and `VITE_APP_WEBSITE_URL` (`https://quomida.qozara.org`) with typed environment variables in `vite-env.d.ts`.
2. **Support & Legal Sections in Settings (`SettingsModal.tsx`)**:
   - Integrated a dedicated "Support & Assistance" section offering direct `mailto:support@qozara.org` and `mailto:legal@qozara.org` actions.
   - Integrated a dedicated "Legal & Licensing" section with external links (`target="_blank" rel="noopener noreferrer"`) to:
     - Terms of Service: `https://qozara.org/legal/quomida/tos.html`
     - Privacy Policy: `https://qozara.org/legal/quomida/privacy.html` (displaying a Google Limited Use compliance badge)
     - Open Source License: `https://quomida.qozara.org/LICENSE` (Apache 2.0)
   - Embedded Qozara Lab attribution and open-source community copyright in the footer.
   - Enforced WCAG 2.2 touch target compliance ($\ge 44 \times 44$px) on all interactive elements.
3. **Consent-Time Disclosure in Storage Settings (`StorageSettingsPanel.tsx`)**:
   - Included a prominent Google API Limited Use disclosure card clarifying the Bring Your Own Storage (BYOS) privacy model and linking to the Privacy Policy and Terms of Service.
4. **100% Dual-Language Parity (`@quomida/i18n-locales`)**:
   - Synchronized all legal, support, license, and disclosure dictionary keys across English (`en.json`) and Spanish (`es.json`).

## Consequences

- **Pros**:
  - Full compliance with Google OAuth verification requirements for production publishing.
  - Seamless user experience for reaching developer support and reviewing legal agreements directly inside the web app.
  - Consistent branding and legal infrastructure across the Qozara ecosystem (Quomida and Quozen).
  - Maintained zero-vulnerability posture and green test suite across 41 test files.
- **Cons**:
  - Requires maintaining external legal pages up-to-date on `qozara.org` as privacy terms or Google API policies evolve.
