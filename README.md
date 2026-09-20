# 🥗 Quomida: Mobile-First Privacy-Centric Macro Tracker

**Quomida** is an open-source, privacy-first, mobile-first calorie and macro tracking application designed for speed, regional food accuracy (specifically Latin American food & cuts), and total user data ownership.

It is part of the **Qozara** project portfolio (alongside [Quozen](https://github.com/qozara/quozen)).

---

## 📚 Architectural & Developer Documentation

All architectural decisions, product specifications, component blueprints, and persistence guides are maintained in the [`docs/`](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/README.md) directory:

- 💾 **[Persistence, Versioning & Migrations Guide](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/persistence-and-migrations.md)** — **Critical Architecture**: The 3-tier versioning model, dual independent migration engines (RxDB Local vs `@qozara/gdocs-schema` Remote), automated backups, and developer playbook.
- 🏗️ **[Architecture Blueprint](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/ARCHITECTURE.md)** — Monorepo packages, RxDB schemas, BYOS flow, and sequence diagrams.
- ☁️ **[Google Drive & Sheets Connector](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/connectors/google-drive-sheets.md)** — Google OAuth configuration, dual spreadsheet model, dynamic mapping, and live E2E testing.
- 🛠️ **[Developer CLI Harness](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/apps/cli/README.md)** — Terminal CLI for OAuth login/logout, domain calculations, and live E2E testing.
- 📋 **[Product Specification](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/PRODUCT_SPEC.md)** — Functional requirements, wireframe specs, regional datasets, and WCAG 2.2 accessibility.
- 📜 **[Architectural Decision Records (ADRs)](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/README.md)** — MADR-standard records (0000 through 0015: RxDB, BYOS, Immutability, Yield Factors, ETL, LLM Fallback, Recovery UX, Dynamic Mapping, Dual Migrations, Hook Registry, Catalog Hydration).
- 🥗 **[ETL & Catalog Hydration Pipeline](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/apps/etl-pipeline/README.md)** — Decoupled static dataset compiler, two-file delta synchronization, shift-left data sanitization, and infrastructure-agnostic CDN deployment.
- 👩‍💻 **[Contributing & TDD Guide](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/CONTRIBUTING.md)** — Developer workflow, running unit/E2E tests, and schema migrations.
- 🤖 **[AI Coding Agent Invariants](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/AGENTS.md)** — Critical invariants, zero-vulnerability policy, and strict isolation rules.

---

## 🌟 Key Architecture Principles

1. **Local-First, Zero-Latency Storage**: Instant reads and writes with zero network latency. Full offline functionality out of the box using **RxDB (IndexedDB)**.
2. **BYOS (Bring Your Own Storage) & Storage Strategy Pattern**: Presentation and domain logic are decoupled from storage backends. Data is routed declaratively:
   - Application configuration (`user_settings`) persists as private JSON blobs in hidden cloud storage (e.g. Google Drive `appDataFolder`).
   - Personal transactional consumption history (`daily_logs`) syncs to private spreadsheets (`Quomida Daily Logs`) with auto-generated human-readable summary columns (`food_details_readonly`).
   - Master food catalogs (`base_ingredients`, `recipes`, `portions`) sync to separate, shareable spreadsheets (`Quomida Food Catalog`), allowing users to share custom ingredients with family or trainers without exposing private daily calorie records.
3. **Dual Migration Engines & Three-Tier Version Tracking**:
   - **Tier 1 (App Version)**: SemVer release + Git commit SHA.
   - **Tier 2 (Local DB Version)**: RxDB collection schema versioning with build-time validation (`validate-schemas.js`) and crash-proof emergency Dexie export (`DatabaseRecoveryScreen`).
   - **Tier 3 (Cloud Store Version)**: Cloud document versioning via `@qozara/gdocs-schema`, tracked in Google Drive `appProperties` and hidden `_migrations` spreadsheet tabs.
4. **Dynamic Header Mapping & Non-Destructive Repair**:
   - Serializers map fields dynamically against row 1 headers (`row.headers`), making sync resilient to users reordering columns in Google Sheets.
   - If columns are missing or corrupted, background sync is automatically suspended, an automated Google Drive backup copy is created (`createBackup()`), and missing columns are appended non-destructively without erasing user data.
5. **Curated Latin American Food Engine**: Incorporates ARGENFOODS, LATINFOODS, and USDA datasets for regional meat cuts (*vacío*, *asado de tira*, *entraña*, *matambre*) and local ingredients (*palta*, *frutilla*, *choclo*).
6. **FAO/INFOODS Recipe Yield Modeling**: Models raw ingredient weights and cooking yield retention factors instead of arbitrary guesses.
7. **Historical Immutability**: Daily log entries snapshot macro values and food names at logging time so future recipe or portion changes never retroactively alter past nutrition history.

---

## 🏗️ Monorepo Structure

```
quomida/
├── packages/
│   ├── domain-core/      # Isomorphic TypeScript SDK: RxDB schemas, yield formulas & calculations
│   ├── sync-adapters/    # Unified SyncAdapter, Composite strategy, @qozara/gdocs-schema validation, Mock & Google Drive/Sheets
│   ├── llm-engine/       # Natural language meal log parser with fallback handlers
│   └── i18n-locales/     # Centralized English & Spanish translation dictionaries
├── apps/
│   ├── webapp/           # React 19 + Vite + RxDB PWA with modern glassmorphic mobile UI
│   ├── etl-pipeline/     # Regional food dataset ingestion & seed_v1.json builder
│   └── cli/              # Terminal CLI: domain testing, Google OAuth login/logout & live E2E tests
├── docs/                 # Architecture blueprints, persistence guides, product spec, ADRs, and guides
└── AGENTS.md             # AI Agent rules & verification registry
```

---

## ☁️ Cloud Connectors

Quomida uses a Bring Your Own Storage (BYOS) architecture, allowing users to sync their local RxDB data to their personal cloud storage with total data ownership:

- **[Google Drive & Sheets](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/connectors/google-drive-sheets.md)**: Syncs raw configuration to private Drive app data and tabular data to dual Google Sheets (`Quomida Daily Logs` and `Quomida Food Catalog`) with `@qozara/gdocs-schema` validation, dynamic header mapping, and automated safety backups.
- **[Mock Sync Adapter](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/connectors/mock-adapter.md)**: In-memory/local storage fallback used for offline local development and zero-config evaluations.

---

## 🚀 Quickstart (Local Development)

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Web Application

```bash
npm run dev
```

Open `http://localhost:3000` to launch the app. Out of the box, Quomida runs in offline zero-config mode with `MockSyncAdapter`.

### 3. Run Automated Test Suite

```bash
# Run unit & domain tests across all packages (Vitest)
npm run test

# Run build verification across all workspaces
npm run build

# Run security vulnerability audit (Zero-vulnerability policy)
npm audit
```

### 4. CLI Google OAuth & Live E2E Testing

You can authenticate and test synchronization against real Google Drive / Sheets directly from the command line:

```bash
# 1. Start browser OAuth login and save credentials to ~/.quomida/credentials.json
npm run login --workspace=@quomida/cli

# 2. Run push/pull E2E tests against live Google Drive & Sheets
npm run test:e2e --workspace=@quomida/cli

# 3. Log out and clear credentials
npm run logout --workspace=@quomida/cli
```

---

## 📄 License

MIT License - free and open-source software built by Qozara.
