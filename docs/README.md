# 📚 Quomida Documentation & Architectural Index

Welcome to the Quomida developer and architectural documentation repository. This directory contains specifications, decision records, architecture blueprints, and contribution guidelines designed for human engineers and AI coding agents.

---

## 🧭 Navigation Index

| Document | Description |
| :--- | :--- |
| 🏗️ [Architecture Blueprint](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/ARCHITECTURE.md) | High-level system architecture, monorepo package graph, RxDB schemas, BYOS flow, and reactivity model. |
| 💾 [Persistence, Versioning & Migrations](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/persistence-and-migrations.md) | **Essential Guide**: The 3-Tier versioning model, dual migration engines (RxDB vs `@qozara/gdocs-schema`), safety backups, and developer playbook. |
| 📋 [Product Specification](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/PRODUCT_SPEC.md) | Functional spec, wireframes, Latin American food catalog design, WCAG 2.2 accessibility, and non-functional requirements. |
| ☁️ [Google Drive & Sheets Connector](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/connectors/google-drive-sheets.md) | Google OAuth configuration, dual spreadsheet model, dynamic mapping, and live E2E testing. |
| 🛠️ [Developer CLI Harness](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/apps/cli/README.md) | Terminal CLI for OAuth login/logout, domain catalog calculations, and live E2E testing. |
| 👩‍💻 [Contributing & TDD Guide](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/CONTRIBUTING.md) | Development setup, Test-Driven Development (TDD) cycle, schema migrations, and sync adapter guidelines. |
| 🤖 [AI Agent Guidelines](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/AGENTS.md) | Operational invariants, schema rules, and instructions optimized for autonomous AI coding agents. |
| 📜 [Architectural Decision Records (ADRs)](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/README.md) | Formal records of key technical and architectural decisions (0000 through 0013). |
| 📦 [Archived Initial Drafts](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/archive/) | Original raw product spec, product idea, and initial implementation draft files. |

---

## 🏛️ Architectural Decision Records (ADRs)

All architectural decisions in Quomida are recorded using the [MADR (Markdown Architecture Decision Record)](https://adr.github.io/madr/) format:

- [ADR 0000: Use Markdown Architectural Decision Records](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/0000-use-markdown-architectural-decision-records.md)
- [ADR 0001: RxDB + IndexedDB Local-First Client Engine](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/0001-rxdb-indexeddb-local-first-engine.md)
- [ADR 0002: Bring Your Own Storage (BYOS) & Decoupled Sync Adapter](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/0002-byos-decoupled-sync-adapter-pattern.md)
- [ADR 0003: Immutability of Historical Macro Snapshots in Daily Logs](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/0003-historical-macro-immutability.md)
- [ADR 0004: Compound Recipe Yield & Retention Factors (FAO/INFOODS Standard)](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/0004-compound-recipe-fao-infoods-yield-factors.md)
- [ADR 0005: Decoupled Build-Time ETL Ingestion Pipeline](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/0005-build-time-etl-regional-food-ingestion.md)
- [ADR 0006: LLM Natural Language Meal Parser with Graceful Fallback](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/0006-natural-language-llm-fallback-degradation.md)
- [ADR 0007: LocalDBService Repository Pattern and Unified BYOS Sync Boundary](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/0007-local-repository-service-and-sync-boundary.md)
- [ADR 0008: Service Worker PWA Application Shell & Heartbeat Connectivity Monitoring](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/0008-service-worker-pwa-app-shell-and-heartbeat-connectivity.md)
- [ADR 0009: State Evaluator, Sync Inspector Popover, and Modular Storage Settings](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/0009-state-evaluator-sync-inspector-and-storage-settings.md)
- [ADR 0010: Storage Strategy Pattern & Composite Multi-Format Cloud Sync Connectors](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/0010-storage-strategy-composite-cloud-sync-connectors.md)
- [ADR 0011: Build-Time Schema Validation & Database Recovery UX](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/0011-build-time-schema-validation-and-recovery.md)
- [ADR 0012: Cloud Spreadsheet Schema Validation, Dynamic Header Mapping & Remediation](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/0012-schema-validation-dynamic-mapping-and-remediation.md)
- [ADR 0013: Dual-Layer Migration Engines and Three-Tier Version Tracking Architecture](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/0013-dual-migration-frameworks-and-three-tier-versioning.md)
- [ADR 0014: UI Adapter Static Hook Registry](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/0014-ui-adapter-static-hook-registry.md)
- [ADR 0015: Decoupled Catalog Hydration & Two-File Delta Synchronization](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/0015-decoupled-catalog-hydration-and-two-file-delta-sync.md)
- [ADR 0016: ETL Cloudflare Pages Deployment Strategy](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/0016-etl-cloudflare-pages-deployment-strategy.md)
- [ADR 0017: Resumable Streaming & Memory-Safe Catalog Architecture](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/0017-resumable-streaming-memory-safe-catalog.md)
