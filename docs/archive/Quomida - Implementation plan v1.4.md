# Implementation Plan v1.4

> 1. HIGH-LEVEL ARCHITECTURE

**System Context:** Quomida operates entirely on the client, leveraging RxDB for local-first persistence and a decoupled sync adapter pattern to push state to a user's personal storage (e.g., Google Drive). The architecture strictly isolates domain logic within packages/domain-core from the UI in apps/webapp and external dependencies in packages/sync-adapters, following an isomorphic monorepo structure.  

**Design Patterns:**
* **Adapter Pattern:** Enables swapping between a mock storage interface for local testing, Google Drive, or a local filesystem without altering the core application logic.  
* **Repository Pattern:** Wraps RxDB collections to provide a strict, typed internal API, ensuring the UI remains ignorant of the underlying database engine.  
* **Observer Pattern:** Utilizes RxDB's native observables to push state changes to React components seamlessly, creating a reactive UI.  
* **Isomorphic Core:** Pure TypeScript logic containing calculations and schema validators, built to execute consistently across Node environments (ETL/CLI) and the Browser.

> 2. DATA MODEL & PERSISTENCE

**Schema Definitions:** RxDB relies on JSON Schema definitions (`base_ingredients`, `recipes`, `portions`, `daily_logs`, `user_settings`).
**Relationships:** daily_logs.food_reference_id loosely links to either base_ingredients.id or recipes.id.

> 3. API CONTRACTS

Internal package interfaces replace standard REST contracts (`CloudSyncProvider`, `LLMEngine`).
