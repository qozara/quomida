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

**Workflow Integration (Direct Upload):**
- **Pushes, Cron Jobs & Manual Triggers**: We retain the `.github/workflows/etl.yml` GitHub Action. It is responsible for building the pipeline (`npm run etl`) directly in the GitHub Actions Ubuntu runner.
- **Deployment**: After a successful build, the Action uses `cloudflare/pages-action` to directly upload the generated `apps/webapp/public` folder to Cloudflare's edge network. Cloudflare is not responsible for installing dependencies or running the build script.

## Consequences

**Positive:**
- Complete CI/CD control remains in GitHub Actions.
- Cloudflare is used strictly as a highly-performant static CDN.
- Avoids Cloudflare Pages build environment debugging and limits.

**Negative:**
- Requires managing Cloudflare API Tokens and Account IDs in GitHub Secrets.
