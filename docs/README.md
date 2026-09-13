# 📚 Quomida Documentation & Architectural Index

Welcome to the Quomida developer and architectural documentation repository. This directory contains specifications, decision records, architecture blueprints, and contribution guidelines designed for human engineers and AI coding agents.

---

## 🧭 Navigation Index

| Document | Description |
| :--- | :--- |
| 🏗️ [Architecture Blueprint](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/ARCHITECTURE.md) | High-level system architecture, monorepo package graph, RxDB schemas, BYOS flow, and reactivity model. |
| 📋 [Product Specification](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/PRODUCT_SPEC.md) | Functional spec, wireframes, Latin American food catalog design, WCAG 2.2 accessibility, and non-functional requirements. |
| 👩‍💻 [Contributing & TDD Guide](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/CONTRIBUTING.md) | Development setup, Test-Driven Development (TDD) cycle, schema migrations, and sync adapter guidelines. |
| 🤖 [AI Agent Guidelines](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/AGENTS.md) | Operational invariants, schema rules, and instructions optimized for autonomous AI coding agents. |
| 📜 [Architectural Decision Records (ADRs)](file:///Users/diegodesogos/VSCodeProjects/qozara/quomida/docs/adr/README.md) | Formal records of key technical and architectural decisions (RxDB, BYOS, Immutability, Yield Factors, ETL, LLM Fallback). |
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
