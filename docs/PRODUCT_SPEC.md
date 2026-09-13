# 🥗 Quomida Product Specification

**Version:** 1.4  
**Type:** Mobile-First, Privacy-Centric Calorie & Macro Tracker  
**Ecosystem:** Qozara Open-Source Portfolio

---

## 1. Product Vision & Target Audience

Quomida is a mobile-first calorie and macronutrient tracking web application designed specifically for speed, complete privacy, and high-accuracy Latin American regional food logging.

### Core Value Pillars
1. **Total Privacy & Data Ownership (BYOS)**: Health and dietary habits are stored locally on the user's device and personal cloud storage. Zero third-party proprietary server tracking.
2. **Zero-Latency Mobile UX**: Reads and writes occur instantly against local RxDB IndexedDB.
3. **Curated Latin American Food Engine**: Native support for regional meat cuts (*vacío*, *asado de tira*, *matambre*, *entraña*) and dishes (*milanesa*, *empanadas*) using ARGENFOODS, LATINFOODS, and USDA datasets.
4. **FAO/INFOODS Yield Retention**: Accurately tracks prepared/cooked dishes by applying cooking factor loss/gain to raw weights.

---

## 2. Information Architecture & Key UI Screens

### A. Daily Summary Dashboard (`/`)
- **Macro Progress Rings**: Dynamic progress visuals for Calories (Emerald), Protein (Rose), Carbs (Amber), and Fats (Cyan).
- **Date Navigation**: Previous/Next day controls with formatted date text (`es-AR` / `en-US`).
- **Sync Status Badge**: Real-time indication of sync state (`synced`, `syncing`, `disconnected`) with `aria-live="polite"` screen reader announcements.

### B. Food Logger & Input Switcher
- **Segmented Control**: Switch between **Catalog Search** and **AI Natural Log**.
- **Search System vs Custom Priority**: Live autocomplete filtering. User-created custom ingredients natively override system ingredients on naming collisions.
- **AI Natural Language Logger**: Parse meal text (e.g. *"2 beef empanadas and mixed salad"*) with graceful fallback to the traditional search bar on timeout.

### C. Portion Selection Bottom Sheet Modal
- **Quantity Stepper**: Stepper buttons (`-` / `+`) with numeric input. Minimum touch target size 44x44px.
- **Domestic Unit Selector**: Select between custom domestic portion units (*1 slice*, *1 medium portion*, *1 unit*) and absolute grams (*g*).
- **Live Calculated Nutrition**: Instant recalculation of total calories and macros for selected weight.

### D. Custom Catalog Manager
- **Segmented Tabs**: Ingredients and Domestic Portions.
- **Creation Form**: Modal form to add custom ingredients (100g base base macros) with instant local cache update.

### E. Profile & Settings Modal
- **Preferences**: Language switcher (Español LatAm / English US updating root `<html lang>` attribute) and Theme mode (Dark, Light, System).
- **Nutritional Targets**: Customizable daily targets for calories, protein, carbs, and fats.
- **BYOS Sync Panel**: Storage adapter status display.

---

## 3. Accessibility & Non-Functional Requirements (WCAG 2.2)

1. **Accessibility**:
   - Screen reader announcements via `aria-live="polite"` for sync state changes.
   - Dynamic `<html lang="es">` or `<html lang="en">` attribute switching.
   - All interactive touch targets are a minimum of 44x44 CSS pixels.
2. **Historical Immutability**:
   - Updates to base ingredients or portion definitions MUST NOT retroactively alter past `daily_logs` snapshots.
3. **State Rehydration**:
   - When authenticating on a secondary device, UI strictly waits for `user_settings` collection rehydration to avoid visual language/theme flashes.
