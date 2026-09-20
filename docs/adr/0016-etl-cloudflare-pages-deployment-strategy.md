# 16. ETL Pipeline Deployment on Cloudflare Pages

Date: 2026-09-20

## Status

Accepted

## Context

The Quomida application consists of a primary React/Vite WebApp and a decoupled `@quomida/etl-pipeline`. The ETL pipeline processes massive nutritional datasets (like USDA or ARGENFOODS) into lightweight, versioned `catalog.json` and `catalog_meta.json` payloads that the WebApp fetches at runtime.

Originally, the webapp was deployed on Vercel, and the ETL pipeline outputs were considered for deployment via GitHub Pages using GitHub Actions.

However, a need arose for "Preview Environments" for the ETL data. When developers open Pull Requests for the ETL pipeline, they need a dedicated preview URL serving the new dataset so they can point their Preview WebApps to it for testing before merging to `main`.

GitHub Pages does not natively support infinite preview environments per PR on a single repository. Vercel supports this, but hosting static data on Vercel consumes build minutes and bandwidth that could be optimized.

## Decision

We have decided to split our CDN infrastructure:
1. **WebApp** remains on **Vercel** for its robust React/SSR support and UI preview environments.
2. **ETL Pipeline Data** will be hosted on **Cloudflare Pages**.

**Why Cloudflare Pages for ETL?**
- **Free Unlimited Previews**: Cloudflare natively provisions preview URLs for every Pull Request.
- **Bandwidth**: Serving large, static JSON files via Cloudflare's CDN is highly performant and avoids eating into Vercel's bandwidth limits.
- **Decoupling**: The WebApp and ETL data build processes remain completely isolated.

**Workflow Integration:**
- **Pushes & PRs**: Cloudflare Pages automatically listens to GitHub and runs `npm run etl`. We configure Cloudflare's "Build Watch Paths" to only trigger when `apps/etl-pipeline/` changes.
- **Cron Jobs & Manual Triggers**: We retain a slimmed-down `.github/workflows/etl.yml` GitHub Action. This action does *not* build the pipeline. Instead, it runs on a schedule (every 6 months) or via `workflow_dispatch`, and sends a `curl` request to a **Cloudflare Deploy Hook** to force a data refresh.

## Consequences

**Positive:**
- Developers get 1:1 Preview Environments for ETL changes.
- Zero Vercel build minutes are wasted on data compilation.
- The Git history remains perfectly clean (no auto-committing `seed_v1.json` or `catalog.json` payloads to the repository).

**Negative:**
- Requires managing an additional deployment platform (Cloudflare).
- Requires configuring a `CLOUDFLARE_DEPLOY_HOOK_URL` secret in GitHub to allow Actions to trigger manual/cron builds.
