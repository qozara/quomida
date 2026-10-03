# 🥗 @quomida/etl-pipeline

Decoupled static data compilation and normalization pipeline for Quomida's nutritional food catalogs.

---

## 📖 Overview

`@quomida/etl-pipeline` is responsible for ingesting, sanitizing, and compiling nutritional datasets (such as ARGENFOODS, LATINFOODS, USDA FoodData Central) into a standardized format consumable by `@quomida/webapp`.

The pipeline is completely decoupled from the web application runtime, allowing independent data updates without requiring web application rebuilds or redeployments.

---

To optimize client bandwidth and avoid downloading megabytes of static JSON on every application load, the pipeline outputs assets into two separate tiers:

1. **`system.sqlite`**: Bundled directly into the web application at build time. It contains all foundational data (seeds and portions) and guarantees the web app is immediately functional on first boot, even without network access.
2. **`catalog_meta.json`**: A lightweight manifest (~50 bytes) for external data containing:
   ```json
   {
     "catalogVersion": "4515bcadb9b677ed6b70167994c848e5",
     "generatedAt": "2026-09-20T12:00:00.000Z"
   }
   ```
2. **`catalog.sqlite`**: The complete, versioned payload containing all validated food items with source-based deterministic IDs and `contentHash` properties:
   ```json
   {
     "catalogVersion": "4515bcadb9b677ed6b70167994c848e5",
     "generatedAt": "2026-09-20T12:00:00.000Z",
     "items": [
       {
         "id": "ing-vacambre",
         "name": "Vacío vacuno (crudo)",
         "source": "system",
         "lang": "es",
         "calories_100g": 175,
         "protein_100g": 20.5,
         "carbs_100g": 0,
         "fats_100g": 10.5,
         "contentHash": "0745508c9096720df50feee0d1e34ff0"
       }
     ]
   }
   ```

*Note: The resolver actively prevents duplication by dropping any external dataset item that shares a normalized name with a foundational system item.*

---

## 🥗 Supported Nutritional Data Sources

The ingestion pipeline supports regional Latin American food tables and global packaged food dumps:

1. **System Seeds**: Core ingredients and portions downloaded via `system_ingredients.csv` and `system_portions.csv`.
2. **ARGENFOODS (Argentina)**: National food composition database (`data/raw/argenfoods/*.csv`), tagged with `lang: "es-AR"`.
3. **SARA 2 (Argentina)**: Sistema de Análisis y Registro de Alimentos (`data/raw/sara2/*.csv`), handling $CHO_{disponibles}$ and trace markers (`lang: "es-AR"`).
4. **TBCA (Brazil)**: Tabela Brasileira de Composição de Alimentos (`data/raw/tbca/*.csv`), tagged with `lang: "pt-BR"`.
5. **Open Food Facts (OFF)**: Packaged goods JSONL dump (`data/raw/openfoodfacts/*.jsonl`), filtered for `en:argentina` and `en:brazil`.

### 🔄 Conflict Resolution & Deduplication Hierarchy

When compiling items, the resolver applies a strict priority hierarchy:
$$\text{SYSTEM} > \text{ARGENFOODS} > \text{SARA 2} > \text{TBCA} > \text{Open Food Facts}$$

- **Generic Items**: Grouped by normalized name (lowercased, accents removed, excess whitespace collapsed). Collisions retain the higher-priority source.
- **Packaged Items (OFF)**: Identified by barcode/EAN (`ing-off-<barcode>`) to prevent merging distinct commercial brands or overwriting generic whole foods.

### 📥 Downloading Open Food Facts Dump

An automated script is provided to download and decompress the latest Open Food Facts JSONL dump:
```bash
./apps/etl-pipeline/scripts/download_off.sh
```

---

## 🔒 Security Boundary: Shift-Left Data Hygiene

Security is enforced at the compilation level to eliminate runtime overhead in client browsers:
- **XSS Sanitization**: Strips HTML `<script>`, `<style>`, and markup tags from food names.
- **Nutritional Validation**: Enforces finite, non-negative numbers for macro values (`calories_100g`, `protein_100g`, `carbs_100g`, `fats_100g`).
- **Source Hardening**: Enforces `source: "system"` to ensure imported items never conflict with user-created custom recipes (`source: "custom"`).

---

## 🚀 Getting Started

### 1. Configure the Environment
The ETL pipeline requires a `.env` file to fetch the foundational system catalog. You can create your own CSVs (see section 5), or use the provided local samples to get started quickly.

```bash
cp apps/etl-pipeline/.env.example apps/etl-pipeline/.env
```
Inside `.env`, configure the URLs. You can point them to remote HTTP endpoints or directly to local files via `file://`:
```env
# Option 1: Using local sample CSV datasets (Requires CSV parsing)
SYSTEM_INGREDIENTS_URL="file://./data/examples/system_ingredients.csv"
SYSTEM_PORTIONS_URL="file://./data/examples/system_portions.csv"

# Option 2: Fast-path using a finalized system catalog NDJSON (Skips CSV parsing)
# PREBUILT_SYSTEM_CATALOG_URL="https://example.com/system.sqlite"
# PREBUILT_SYSTEM_CATALOG_URL="file://./data/generated/system.sqlite"

# External sources
TBCA_URL="https://example.com/actual_tbca.csv"
SARA2_URL="https://example.com/actual_sara2.csv"
```

### 2. The Dual-Pipeline Architecture

To ensure clean CI/CD deployments (like Vercel) and fast web app builds, the ETL pipeline is strictly split into two isolated flows:

**Flow A: System Catalog (Built-in)**
- Generates only the foundational `system.sqlite`.
- Has **zero SQLite dependencies**. It bypasses `better-sqlite3` and any C++ native bindings.
- Automatically executed by the webapp during Vercel builds (`npm run build:system`).

**Flow B: External Catalog (Remote HTTP SQLite)**
- Generates the massive 13GB `catalog.sqlite` containing OpenFoodFacts.
- Uses `better-sqlite3` to construct FTS5 trigram indexes for sub-millisecond remote substring search.
- Designed to be run on-demand locally or via a dedicated GitHub Action worker, *never* during a web frontend deployment.
- Triggered manually using `npm run build:external`.

```bash
# Flow B: Process all external datasets locally (requires better-sqlite3)
npm run build:external --workspace=@quomida/etl-pipeline
```

### 3. Understanding `data/raw/` & Handcrafted Files (Maintainer Guide)

In this ETL architecture, the `data/raw/` directory acts as a **pure data sink** for automated download scripts (`download_system.sh`, `download_off.sh`, etc.). When the pipeline runs, these scripts fetch datasets from the URLs configured in your `.env` and ruthlessly dump them into `data/raw/`.

**If you are a maintainer building custom handcrafted CSVs, DO NOT place them in `data/raw/` blindly**, as the download scripts may overwrite them. Instead, use one of these intended workflows:

- **The Safe Way (Recommended):** Place your handcrafted CSVs in a separate, version-controlled directory like `data/examples/` (or your own ignored `data/custom/`). Then, update your `.env` to point to them (e.g., `SYSTEM_INGREDIENTS_URL="file://./data/examples/system_ingredients.csv"`). The automated scripts will safely copy them into `raw/` for processing.
- **The Direct Way:** You *can* place handcrafted files directly into `data/raw/system/`, **but you MUST comment out the corresponding URLs in your `.env`** (e.g., `# SYSTEM_INGREDIENTS_URL="..."`). When commented out, the download scripts will skip the fetch phase, safely leaving your manually placed files intact for the Node.js parser to process.

### 4. Build-Time System Generation

The web application's `prebuild` hook automatically runs this command to ensure `system.sqlite` is built into the app before Vite bundles it:
```bash
npm run build:system --workspace=@quomida/etl-pipeline
```

### 5. Cleaning Cached Data

If you need to reset the pipeline (e.g. to redownload OpenFoodFacts or flush the state tracking):
```bash
npm run clean --workspace=@quomida/etl-pipeline
```
*Note: This script will prompt you for confirmation because it deletes the 13GB downloaded OpenFoodFacts dataset and all intermediate JSONL files.*

### 6. Generate a Custom System Catalog (Advanced)

If you want to generate a rich foundational catalog containing all items for Latin America and Spain, you can instruct the pipeline to scan OpenFoodFacts and output clean **CSV** templates that you can edit in Excel or Google Sheets.

1. Ensure you have downloaded Open Food Facts at least once (`npm run start --workspace=@quomida/etl-pipeline -- --with-off`).
2. Run the generator:
   ```bash
   npm run generate-system-catalog --workspace=@quomida/etl-pipeline
   ```
3. The script will output two CSV files in `apps/etl-pipeline/data/generated/`.
4. Upload these customized CSVs to your own hosting (or use them locally via `file://`) and configure `SYSTEM_INGREDIENTS_URL` and `SYSTEM_PORTIONS_URL`.

---

## 🌐 Infrastructure-Agnostic Deployment

The webapp consumes catalog updates via the `VITE_CATALOG_BASE_URL` environment variable.

### 1. Local Development & CI
- `VITE_CATALOG_BASE_URL=""` (relative root path).
- Vite serves `catalog_meta.json` and `catalog.sqlite` statically from `apps/webapp/public/`.
- In CI test runs, if the files are not generated, the hydration service degrades gracefully without throwing.

### 2. Production (Any Static CDN / Object Storage)
Because the pipeline is decoupled, you can host the catalog on any static file provider:
- **GitHub Pages**: A scheduled GitHub Action runs `npm run etl` and deploys to a static branch.
- **AWS S3 / Cloudflare R2**: Upload `catalog.sqlite` and `catalog_meta.json` to an S3 bucket with public read access.
- **Vercel Blob / Static Storage**: Upload to Vercel Blob and set `VITE_CATALOG_BASE_URL=https://blob.vercel-storage.com/...`.

Configure the client webapp `.env.production` to point to your provider:
```env
VITE_CATALOG_BASE_URL=https://data.yourdomain.com
```

### 3. Official Infrastructure: Cloudflare R2 Distribution

For the official Qozara deployment, the catalog is hosted on **Cloudflare R2 Object Storage** using multipart S3 uploads (bypassing the 300MB Wrangler CLI limit).

The upload script deploys 4 artifacts:
1. `catalog.sqlite`: Uncompressed SQLite database for HTTP VFS range requests.
2. `catalog.sqlite.gz`: Compressed SQLite database with trigram indexing for browser OPFS downloads.
3. `catalog_meta.json`: Catalog version, item count, and generation timestamp.
4. `system.sqlite`: Built-in seed database referenced for offline boot and CI fast-paths.

#### Environments: Preview vs Production

We support two isolated environments:
* **Preview (`preview-quomida-data`)**: Dedicated bucket for staging, PR testing, and preview webapp builds (`VITE_CATALOG_BASE_URL=https://preview.data.quomida.qozara.org`).
* **Production (`quomida-data`)**: Public production CDN bucket (`VITE_CATALOG_BASE_URL=https://data.quomida.qozara.org`).

#### Local R2 Upload (Maintainers)

Maintainers can upload to either environment without having to edit or comment out lines in `.env`.

1. Add your S3-compatible R2 credentials to `apps/etl-pipeline/.env`:
   ```env
   CLOUDFLARE_ACCOUNT_ID="your_account_id"

   # Preview Target
   PREVIEW_CLOUDFLARE_BUCKET_NAME="preview-quomida-data"
   PREVIEW_R2_ACCESS_KEY_ID="your_preview_r2_access_key"
   PREVIEW_R2_SECRET_ACCESS_KEY="your_preview_r2_secret_key"

   # Production Target
   PROD_CLOUDFLARE_BUCKET_NAME="quomida-data"
   PROD_R2_ACCESS_KEY_ID="your_prod_r2_access_key"
   PROD_R2_SECRET_ACCESS_KEY="your_prod_r2_secret_key"
   ```

2. Run the corresponding upload command:
   ```bash
   # Upload to Preview bucket:
   npm run upload:r2:preview --workspace=@quomida/etl-pipeline
   # (or from monorepo root: npm run etl:upload:preview)

   # Upload to Production bucket:
   npm run upload:r2:prod --workspace=@quomida/etl-pipeline
   # (or from monorepo root: npm run etl:upload:prod)
   ```

#### GitHub Actions CI (`.github/workflows/etl.yml`)

The ETL workflow automates catalog compilation and deployment:
* **Automatic Target Selection**:
  * Pushes/merges to `main` or scheduled 6-month cron runs automatically upload to **`prod`**.
  * Pull request branches automatically upload to **`preview`**.
* **Manual Execution (`workflow_dispatch`)**:
  * Provides an interactive dropdown in GitHub Actions (`target_env: preview | prod`) allowing maintainers to re-run builds for any branch against either bucket.
* **Required GitHub Secrets**:
  * `CLOUDFLARE_ACCOUNT_ID`
  * `PROD_R2_ACCESS_KEY_ID` & `PROD_R2_SECRET_ACCESS_KEY`
  * `PREVIEW_R2_ACCESS_KEY_ID` & `PREVIEW_R2_SECRET_ACCESS_KEY`


---

## 🔮 Extending with New Data Sources

When adding real API scrapers or new static CSV datasets (USDA, Latinfoots, BEDCA, etc.):
1. Add parser modules under `src/sources/<source-name>.ts`.
2. Map raw source records to the `BaseIngredient` interface.
3. Pass raw items through `sanitizeIngredient()` and `computeContentHash()`.
4. Run `npm test` to verify deterministic hashing and schema compliance.

## 🏗️ Architecture: Hybrid OPFS SQLite Distribution

To optimize client bandwidth and memory, the pipeline outputs assets into three distinct SQLite artifacts:

1. **`system.sqlite`**: Bundled directly into the web application at build time. Contains only essential System items (originating from `system_ingredients.csv`) and guarantees the web app is immediately functional on first boot.
2. **`catalog.sqlite` (HTTP VFS)**: Uncompressed database using `unicode61`. Hosted on Cloudflare R2 and queried remotely via HTTP Range Requests when the user hasn't downloaded the full catalog over Wi-Fi.
3. **`catalog.sqlite.gz` (OPFS Download)**: Compressed massive database utilizing the advanced `trigram` tokenizer for fuzzy search. Downloaded directly into the browser's OPFS by the client download manager.
4. **`catalog_meta.json`**: A lightweight manifest containing the `catalogVersion` hash and total items.
