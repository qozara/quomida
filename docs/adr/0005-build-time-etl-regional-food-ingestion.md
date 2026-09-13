# 0005. Decoupled Build-Time ETL Ingestion Pipeline

* Status: accepted
* Date: 2026-09-12

## Context and Problem Statement

Open databases for Latin American foods (ARGENFOODS, LATINFOODS, TBCA) exist as static CSV/Excel datasets without modern REST APIs. Importing raw CSV parsers into the client web app bundle would increase bundle size and slow initial application startup.

## Decision Outcome

Chosen option: **Decoupled Node.js Build-Time ETL Pipeline (`apps/etl-pipeline`)**.

The build pipeline ingests static regional datasets, normalizes items to 100g edible portions, applies schema validation, and generates a versioned JSON seed file (`seed_v1.json`) bundled with `@quomida/webapp` for RxDB cache hydration on initial load.

```
ARGENFOODS / LATINFOODS / USDA Datasets
 └── apps/etl-pipeline (Node.js script)
      └── apps/webapp/src/assets/seed_v1.json
           └── RxDB Hydration (First Launch)
```
