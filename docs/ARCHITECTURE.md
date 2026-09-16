# 🏗️ Quomida System Architecture Blueprint

**Version:** 1.5  
**Architectural Style:** Monorepo, Local-First, Bring Your Own Storage (BYOS), Isomorphic TypeScript

---

## 1. System Overview

Quomida is a privacy-first, local-first web application designed for zero-latency calorie and macronutrient tracking. It eliminates client-side server dependency by storing all user state locally in **RxDB (IndexedDB)** and replicating changes asynchronously to the user's personal storage (Google Drive / Sheets). Service Worker PWA support ensures full cold-start offline shell availability.

```mermaid
graph TD
    subgraph Client Application (Browser / PWA)
        SW[Service Worker / Cache Storage] -->|Serves App Shell Offline| UI[React 19 WebApp]
        UI -->|Queries & Mutates| Repo[Domain Core Repository]
        Repo -->|RxDB API| DB[(Local RxDB Engine / IndexedDB)]
        DB -->|Native Observables| UI
    end

    subgraph BYOS Persistence Adapter
        DB -->|Delta Replication| SyncAdapter[SyncAdapter Interface]
        SyncAdapter -->|Mock / Test| MockSync[MockSyncAdapter]
        SyncAdapter -->|Production| GSheetsSync[GoogleDriveSheetsSyncAdapter]
    end

    subgraph User Personal Storage
        GSheetsSync -->|HTTPS / REST| Drive[(User Google Drive / Sheets)]
    end
```

---

## 2. Monorepo Package Architecture

Quomida operates as a clean monorepo structured to ensure complete isolation between domain logic, persistence adapters, and presentation:

```
quomida/
├── packages/
│   ├── domain-core/        # Isomorphic TS logic: RxDB JSON schemas, formulas, domain types
│   ├── sync-adapters/      # SyncAdapter interface, MockSyncAdapter, Google Drive adapter
│   ├── llm-engine/         # Natural language log parser with fallback handlers
│   └── i18n-locales/       # Centralized localization keys (es.json, en.json)
├── apps/
│   ├── webapp/             # React 19 + Vite + Tailwind PWA with glassmorphic mobile UI
│   ├── etl-pipeline/       # Node.js ETL pipeline normalizing LATINFOODS/ARGENFOODS/USDA datasets
│   └── cli/                # Terminal CLI for offline catalog inspection & domain testing
```

### Dependency Rules & Constraints
1. **`packages/domain-core`**: MUST remain strictly isomorphic. ZERO DOM dependencies, zero UI framework dependencies, and zero database driver imports.
2. **`packages/sync-adapters`**: Communicates strictly via `SyncDeltaPayload` objects.
3. **`apps/webapp`**: Consumes `@quomida/domain-core` and `@quomida/sync-adapters` via generic interfaces.

---

## 3. Data Model & RxDB Schemas

RxDB serves as the primary cache and single source of truth for the application.

```mermaid
classDiagram
    class BaseIngredient {
        +string id
        +string name
        +string source
        +string lang
        +float calories_100g
        +float protein_100g
        +float carbs_100g
        +float fats_100g
    }

    class Recipe {
        +string id
        +string name
        +RecipeItem[] ingredients
        +float yield_factor
    }

    class Portion {
        +string id
        +string base_food_id
        +string name
        +float equivalent_weight_g
    }

    class DailyLog {
        +string id
        +string timestamp
        +string date
        +string meal_type
        +string food_reference_id
        +string food_name
        +float quantity
        +string portion_name
        +MacroSnapshot macros
    }

    class UserSettings {
        +string id
        +string locale
        +string theme
        +float daily_calorie_target
        +CustomMacros custom_macros
    }

    Portion --> BaseIngredient : references base_food_id
    Portion --> Recipe : references base_food_id
    DailyLog --> BaseIngredient : snapshots macros & food_name from food_reference_id
    Recipe --> BaseIngredient : contains ingredient_id array
```

### Collections Breakdown
- **`base_ingredients`**: Edible portion normalized to 100g base.
- **`recipes`**: Compound meals applying cooking yield retention factors (FAO/INFOODS standard).
- **`portions`**: Domestic household portion unit mappings (e.g. 1 slice, 1 portion = 150g).
- **`daily_logs`**: Transactional ledger of consumed items. Hardcodes macro snapshots and food names at creation time for historical immutability.
- **`user_settings`**: Cross-device global preferences (`global_settings`).

---

## 4. BYOS Sync Flow Sequence

```mermaid
sequenceDiagram
    participant UI as React WebApp
    participant DB as RxDB (IndexedDB)
    participant Sync as CompositeSyncAdapter
    participant Blob as BlobStorageDriver (appData)
    participant Tabular as TabularStorageDriver (Sheets)

    UI->>DB: insertDailyLog(data)
    DB-->>UI: Reactive Observable update (Instant UX)
    DB->>Sync: Push delta payload (debounced)
    alt Collection is user_settings
        Sync->>Blob: writeBlob(settings.json)
    else Collection is daily_logs / catalog
        Sync->>Tabular: writeTable(Quomida Daily Logs / Catalog)
    end
    Sync-->>UI: Update SyncStatus badge ("Synced")
```

---

## 5. Design Patterns Applied

- **Storage Strategy Pattern**: Decouples remote storage formats across domains. `CompositeSyncAdapter` routes unformatted application configuration (`user_settings`) to `BlobStorageDriver` and tabular data (`daily_logs`, `base_ingredients`, `recipes`, `portions`) to `TabularStorageDriver`, enabling plug-and-play support for Google Drive, OneDrive, or Box.
- **Adapter Pattern**: Swappable storage backends (Mock storage for offline dev/tests vs Google Drive Sheets for production).
- **Repository Pattern**: Wraps RxDB collections into typed domain methods (`LocalDBService`).
- **Observer Pattern**: Native RxDB observables push live updates to React component state.
- **Isomorphic Domain Core**: Math calculations execute identically in Node.js (CLI/ETL) and Browser environments.

---

## 6. Offline PWA Shell & Heartbeat Architecture

- **PWA Service Worker**: Managed via `vite-plugin-pwa` (`generateSW`). Automatically precaches `index.html`, core JavaScript, CSS, and SVG icons. Serves navigation requests offline (`NetworkFirst` with cache fallback) and hashed assets (`CacheFirst`).
- **Heartbeat & Network Detection**: `AppContext` listens to browser `online`/`offline` window events and executes a periodic 30-second `HEAD /` ping to verify real server reachability. Updates status reactively to `'disconnected'` on connection drop or failed ping.
- **WCAG 2.2 Accessibility**: Header status badge uses an `sr-only` element inside an `aria-live="polite"` region to announce connectivity state changes to screen readers in English and Spanish.

