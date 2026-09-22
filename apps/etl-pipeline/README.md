# 🥗 @quomida/etl-pipeline

Decoupled static data compilation and normalization pipeline for Quomida's nutritional food catalogs.

---

## 📖 Overview

`@quomida/etl-pipeline` is responsible for ingesting, sanitizing, and compiling nutritional datasets (such as ARGENFOODS, LATINFOODS, USDA FoodData Central) into a standardized format consumable by `@quomida/webapp`.

The pipeline is completely decoupled from the web application runtime, allowing independent data updates without requiring web application rebuilds or redeployments.

---

## 🏗️ Architecture: Two-File Delta Distribution

To optimize client bandwidth and avoid downloading megabytes of static JSON on every application load, the pipeline outputs two assets:

1. **`catalog_meta.json`**: A lightweight manifest (~50 bytes) containing:
   ```json
   {
     "catalogVersion": "4515bcadb9b677ed6b70167994c848e5",
     "generatedAt": "2026-09-20T12:00:00.000Z"
   }
   ```
2. **`catalog.json`**: The complete, versioned payload containing all validated food items with source-based deterministic IDs and `contentHash` properties:
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

---

## 🥗 Supported Nutritional Data Sources

The ingestion pipeline supports regional Latin American food tables and global packaged food dumps:

1. **System Seeds**: Hardcoded foundational cuts, whole foods, and common pantry staples.
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

## ⚙️ Running Locally

```bash
# Run the ETL compilation script
npm run etl
```

Build outputs:
- `apps/webapp/public/catalog.json` (gitignored)
- `apps/webapp/public/catalog_meta.json` (gitignored)

---

## 🌐 Infrastructure-Agnostic Deployment

The webapp consumes catalog updates via the `VITE_CATALOG_BASE_URL` environment variable.

### 1. Local Development & CI
- `VITE_CATALOG_BASE_URL=""` (relative root path).
- Vite serves `catalog_meta.json` and `catalog.json` statically from `apps/webapp/public/`.
- In CI test runs, if the files are not generated, the hydration service degrades gracefully without throwing.

### 2. Production (Any Static CDN / Object Storage)
Because the pipeline is decoupled, you can host the catalog on any static file provider:
- **GitHub Pages**: A scheduled GitHub Action runs `npm run etl` and deploys to a static branch.
- **AWS S3 / Cloudflare R2**: Upload `catalog.json` and `catalog_meta.json` to an S3 bucket with public read access.
- **Vercel Blob / Static Storage**: Upload to Vercel Blob and set `VITE_CATALOG_BASE_URL=https://blob.vercel-storage.com/...`.

Configure the client webapp `.env.production` to point to your provider:
```env
VITE_CATALOG_BASE_URL=https://data.yourdomain.com
```

### 3. Qozara Official Infrastructure (Cloudflare Pages Direct Upload)
For the official Qozara deployment, we use **GitHub Actions** to build the ETL pipeline and **Cloudflare Pages** strictly as the CDN. This is known as "Direct Upload" and prevents Cloudflare from needing to run build environments, while giving us full CI/CD control inside GitHub.

**GitHub Actions Integration (`.github/workflows/etl.yml`):**
- Runs `npm run etl` on pushes to `main` (Production), Pull Requests (Previews), manually, or via a 6-month cron job.
- Uses `cloudflare/wrangler-action` to upload the generated `apps/webapp/public` directory directly to Cloudflare Pages. Cloudflare automatically routes PRs to a Preview environment URL, and `main` to the Production URL.

**Required GitHub Secrets:**
- `CLOUDFLARE_API_TOKEN`: A token from your Cloudflare profile with "Cloudflare Pages" edit permissions.
- `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare Account ID.

---

## 🔮 Extending with New Data Sources

When adding real API scrapers or new static CSV datasets (USDA, Latinfoots, BEDCA, etc.):
1. Add parser modules under `src/sources/<source-name>.ts`.
2. Map raw source records to the `BaseIngredient` interface.
3. Pass raw items through `sanitizeIngredient()` and `computeContentHash()`.
4. Run `npm test` to verify deterministic hashing and schema compliance.
