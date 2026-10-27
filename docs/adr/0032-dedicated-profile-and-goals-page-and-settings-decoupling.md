# 0032. Dedicated Top-Level Profile & Goals Page and Settings Decoupling

* Status: accepted
* Date: 2026-10-27

## Context and Problem Statement

Initially, user profile information, biometrics (biological sex, date of birth, height, current weight, and physical activity level), nutritional goal configuration (deficit/surplus rates, macro distribution ratios), and adaptive metabolism engine controls were embedded inside an accordion segment within `SettingsModal.tsx`.

This structure presented several usability, architectural, and cognitive drawbacks:
1. **Confused Information Hierarchy**: Settings dialogues typically hold system and operational preferences (app theme, language, cloud sync connectors, Edge AI providers, cache/database resets, terms of service). Core personal fitness parameters, biometrics, and caloric targets represent first-class user domain concepts, which deserve primary navigation status alongside the Daily Log, Analytics, and Food Catalog.
2. **Deep Modal Nesting & Accessibility Friction**: Accessing caloric targets required opening a full-screen slide-over modal, locating and expanding an accordion segment, and scrolling through dense subforms.
3. **Bloated Settings Component Architecture**: `SettingsModal.tsx` maintained extensive state and calculation hooks (`calculateBaselineSeed`, Mifflin-St Jeor calculations, adaptive weight logging, goal selectors) mixed alongside cloud sync credentials, AI key encryption, and PWA updates.

## Decision Outcome

We promote **User Profile & Goals** to a top-level primary page within the main application shell, completely decoupling it from `SettingsModal.tsx`:

1. **Top-Level Screen (`UserProfileGoalsScreen.tsx`)**:
   - Implemented at `apps/webapp/src/components/profile/UserProfileGoalsScreen.tsx`.
   - Features a top-level profile card displaying the user avatar (with Google Cloud avatar or local default), user name, email, and connection badge.
   - Provides an intuitive segmented toggle between **Manual Targets** (calories and macro gram inputs) and **Smart Targets** (biometrics, physical activity level, goal selection with weekly rates, and adaptive metabolism engine toggle).
   - Renders live BMR, TDEE, and daily target macro preview cards calculated reactively via `calculateBaselineSeed()`.
   - Automatically synchronizes initial or modified weight entries with the active date's weight log in RxDB.
   - Provides direct access to technical system settings via a bottom shortcut card and the sticky header gear icon.

2. **Decoupled Settings Modal (`SettingsModal.tsx`)**:
   - Removed the "User Profile & Goals" accordion segment, redundant local state, and calculation utilities from `SettingsModal.tsx`.
   - `SettingsModal` now focuses purely on system preferences: General App Settings (Language, Theme), Edge AI Configuration (Gemini / Ollama), Data & Cloud Sync (Google Drive / Sheets, Offline Database, Cache Resets), and About & Legal.

3. **Bottom Navigation Integration (`BottomNav.tsx`)**:
   - The 4th bottom navigation tab now directs to `UserProfileGoalsScreen` with the label `nav.profileGoals` ("Profile & Goals" / "Perfil y Metas").
   - Maintains the backward-compatible `#btn-open-settings` test hook and touch target requirements (>= 44x44px).

4. **Bi-directional Navigation & Context State (`AppContext.tsx`, `App.tsx`)**:
   - `AppContext` provides `isProfileOpen` and `setIsProfileOpen` alongside existing page state flags.
   - `App.tsx` sticky header dynamically renders the section title and a settings launcher button (`#btn-profile-open-settings`) when on the Profile & Goals screen.
   - Slide-over navigation history seamlessly tracks and restores previous views when opening and closing `SettingsModal`.

## Consequences

### Positive
- **Clear Information Architecture**: User profile and targets have dedicated first-class screen real estate at the same hierarchical level as Dashboard, Analytics, and Catalog.
- **Component Hygiene & SOLID Principles**: Decouples domain biometric and goal state from operational app settings in `SettingsModal.tsx`.
- **Improved UX & Accessibility**: Reduces clicks and nested accordion scrolling to review or adjust nutritional targets.
- **WCAG 2.2 & Dual-Language Parity**: All interactive controls maintain >= 44x44 CSS pixel touch targets with 100% synchronized English and Spanish dictionary strings.

### Negative / Trade-offs
- The 4th tab in `BottomNav` now switches to the Profile & Goals page rather than popping up `SettingsModal` immediately; accessing system settings is now done via the profile page or top bar button.
