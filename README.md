# 🥗 Quomida: Mobile-First Privacy-Centric Macro Tracker

**Quomida** is an open-source, privacy-first, mobile-first calorie and macro tracking application designed for speed, regional food accuracy (specifically Latin American food & cuts), and total user data ownership.

It is part of the **Qozara** project portfolio (alongside [Quozen](https://github.com/qozara/quozen)).

---

## 📚 Architectural & Developer Documentation

All architectural decisions, product specifications, component blueprints, and contribution guidelines are maintained in the [`docs/`](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/README.md) directory:

- 🏗️ **[Architecture Blueprint](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/ARCHITECTURE.md)** — Monorepo packages, RxDB schemas, BYOS flow, and sequence diagrams.
- 📋 **[Product Specification](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/PRODUCT_SPEC.md)** — Functional requirements, wireframe specs, regional datasets, and WCAG 2.2 accessibility.
- 📜 **[Architectural Decision Records (ADRs)](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/README.md)** — MADR-standard records (RxDB, BYOS, Immutability, Yield Factors, ETL, LLM Fallback).
- 👩‍💻 **[Contributing & TDD Guide](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/CONTRIBUTING.md)** — Developer workflow, running unit/E2E tests, and schema migrations.
- 🤖 **[AI Coding Agent Invariants](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/AGENTS.md)** — Critical invariants, schema rules, and guidelines for AI coding agents.

---

## 🌟 Key Architecture Principles

1. **BYOS (Bring Your Own Storage)**: Quomida decouples presentation and business logic from persistent servers. Your data is stored locally in your browser/device using **RxDB (IndexedDB)** and can be seamlessly synced to your personal Google Drive / Sheets.
2. **Local-First & Zero Latency**: Instant reads and writes with zero network latency. Full offline functionality out of the box.
3. **Curated Latin American Food Engine**: Incorporates ARGENFOODS, LATINFOODS, and USDA datasets for accurate regional meat cuts (*vacío*, *asado de tira*, *entraña*, *matambre*) and local ingredients (*palta*, *frutilla*, *choclo*).
4. **FAO/INFOODS Recipe Yield Modeling**: Tracks cooked food by modeling raw ingredient weights and cooking yield retention factors instead of arbitrary static guesses.
5. **Historical Immutability**: Daily log entries snapshot macro values at logging time so future recipe or portion changes never corrupt past nutrition history.

---

## 🏗️ Monorepo Structure

```
quomida/
├── packages/
│   ├── domain-core/      # Isomorphic TypeScript SDK: RxDB schemas, yield formulas & calculations
│   ├── sync-adapters/    # Unified SyncAdapter interface, MockSyncAdapter, Google Drive sync
│   ├── llm-engine/       # Natural language meal log parser with fallback handlers
│   └── i18n-locales/     # Centralized English & Spanish translation dictionaries
├── apps/
│   ├── webapp/           # React 19 + Vite + RxDB PWA with modern glassmorphic mobile UI
│   ├── etl-pipeline/     # Regional food dataset ingestion & seed_v1.json builder
│   └── cli/              # Terminal CLI for offline catalog search and domain testing
├── docs/                 # Architecture blueprints, product spec, ADRs, and guides
└── AGENTS.md             # AI Agent rules & verification registry
```

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
# Run unit & domain tests (Vitest)
npm run test

# Run full non-interactive test suite (Vitest + Playwright E2E)
npm run test:all:non-interactive
```

---

## 📄 License

MIT License - free and open-source software built by Qozara.
