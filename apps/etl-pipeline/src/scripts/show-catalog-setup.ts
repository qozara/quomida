import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), '../../../../');
const envPath = path.resolve(rootDir, 'apps/etl-pipeline/.env');

// Read .env manually
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#\s=]+)=(.*)$/);
    if (match) {
      const key = match[1];
      const value = match[2].replace(/^["']|["']$/g, ''); // strip quotes
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

console.log('\n🥗 Quomida - Catalog Configuration Check\n');

function checkVar(name: string, description: string) {
  const val = process.env[name];
  if (val && !val.startsWith('YOUR_')) {
    console.log(`✅ ${description}`);
    console.log(`   ${name}: \x1b[32m${val}\x1b[0m\n`);
  } else {
    console.log(`❌ ${description}`);
    console.log(`   ${name}: \x1b[90m(Not Configured)\x1b[0m\n`);
  }
}

console.log('--- FAST-PATH SYSTEM CATALOG (Prebuilt) ---');
checkVar('PREBUILT_SYSTEM_CATALOG_URL', 'Prebuilt System Catalog NDJSON');
if (process.env.PREBUILT_SYSTEM_CATALOG_URL && !process.env.PREBUILT_SYSTEM_CATALOG_URL.startsWith('YOUR_')) {
  console.log('   ℹ️  Note: Because PREBUILT_SYSTEM_CATALOG_URL is set, CSV generation will be bypassed.\n');
}

console.log('--- SYSTEM CATALOG (CSV Templates) ---');
checkVar('SYSTEM_INGREDIENTS_URL', 'System Ingredients CSV');
checkVar('SYSTEM_PORTIONS_URL', 'System Portions CSV');

console.log('--- EXTERNAL DATASETS (Regional) ---');
checkVar('SARA2_URL', 'SARA 2 Dataset (Argentina)');
checkVar('TBCA_URL', 'TBCA Dataset (Brazil)');
checkVar('USDA_URL', 'USDA Dataset (USA)');

console.log('--- OPEN FOOD FACTS ---');
console.log('   ℹ️  The 13GB OFF dataset does not use an environment URL.');
console.log('      It is built via the `--with-off` flag during full ETL execution.\n');

// Read webapp .env if it exists
const webappEnvPath = path.resolve(rootDir, 'apps/webapp/.env');
if (fs.existsSync(webappEnvPath)) {
  const envContent = fs.readFileSync(webappEnvPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#\s=]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  });
}

console.log('--- WEBAPP RUNTIME CONFIGURATION ---');
const viteBase = process.env.VITE_CATALOG_BASE_URL;
if (viteBase) {
  console.log(`✅ VITE_CATALOG_BASE_URL: \x1b[32m${viteBase}\x1b[0m`);
  console.log(`   (Webapp will fetch external catalog from this CDN)`);
} else {
  console.log(`❌ VITE_CATALOG_BASE_URL: \x1b[90m(Not Configured)\x1b[0m`);
  console.log(`   (Webapp will fetch external catalog from the relative path '/')`);
}
console.log();

console.log('--- GENERATED WEBAPP ARTIFACTS ---');

const systemMetaPath = path.resolve(rootDir, 'apps/webapp/src/generated/catalog_system_meta.json');
if (fs.existsSync(systemMetaPath)) {
  const meta = JSON.parse(fs.readFileSync(systemMetaPath, 'utf-8'));
  console.log(`✅ System Catalog (Built-in to Webapp)`);
  console.log(`   File: apps/webapp/src/generated/catalog_system.ndjson`);
  console.log(`   Status: Generated on ${new Date(meta.generatedAt).toLocaleDateString()} (Version: ${meta.catalogVersion.substring(0,8)})`);
  console.log(`   Contents: \x1b[33m${meta.itemCount || meta.items?.length || 0} items\x1b[0m`);
  if ((meta.itemCount || meta.items?.length || 0) === 0) {
    console.log(`   \x1b[31mWARNING: Currently generated system catalog is empty!\x1b[0m`);
  }
  
  console.log(`   Next Build Plan:`);
  if (process.env.PREBUILT_SYSTEM_CATALOG_URL && !process.env.PREBUILT_SYSTEM_CATALOG_URL.startsWith('YOUR_')) {
    console.log(`   \x1b[32m-> Will be replaced by prebuilt URL: ${process.env.PREBUILT_SYSTEM_CATALOG_URL}\x1b[0m`);
  } else if (process.env.SYSTEM_INGREDIENTS_URL && !process.env.SYSTEM_INGREDIENTS_URL.startsWith('YOUR_')) {
    console.log(`   \x1b[32m-> Will be rebuilt from configured CSV templates.\x1b[0m`);
  } else {
    console.log(`   \x1b[31m-> WARNING: No URLs configured. The next build will yield 0 system ingredients!\x1b[0m`);
  }
} else {
  console.log(`❌ System Catalog (Built-in to Webapp)`);
  console.log(`   File: apps/webapp/src/generated/catalog_system.ndjson (Missing)`);
  console.log(`   \x1b[33mNote: File will be generated automatically during the build process.\x1b[0m`);
  console.log(`   Next Build Plan:`);
  if (process.env.PREBUILT_SYSTEM_CATALOG_URL && !process.env.PREBUILT_SYSTEM_CATALOG_URL.startsWith('YOUR_')) {
    console.log(`   \x1b[32m-> Will be built from prebuilt URL: ${process.env.PREBUILT_SYSTEM_CATALOG_URL}\x1b[0m`);
  } else if (process.env.SYSTEM_INGREDIENTS_URL && !process.env.SYSTEM_INGREDIENTS_URL.startsWith('YOUR_')) {
    console.log(`   \x1b[32m-> Will be built from configured CSV templates.\x1b[0m`);
  } else {
    console.log(`   \x1b[31m-> WARNING: No URLs configured. The resulting build will have 0 system ingredients!\x1b[0m`);
  }
}
console.log();

if (viteBase) {
  const remoteMetaUrl = `${viteBase.replace(/\/$/, '')}/catalog_meta.json`;
  console.log(`✅ External Catalog (Fetched at Runtime)`);
  console.log(`   Source URL: ${remoteMetaUrl}`);
  try {
    const res = await fetch(remoteMetaUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const meta = await res.json();
    console.log(`   Status: \x1b[32mAccessible\x1b[0m - Generated on ${new Date(meta.generatedAt).toLocaleDateString()} (Version: ${meta.catalogVersion.substring(0,8)})`);
    console.log(`   Contents: \x1b[33m${meta.itemCount || 0} items\x1b[0m`);
  } catch (e: any) {
    console.log(`   Status: \x1b[31mUnreachable\x1b[0m`);
    console.log(`   \x1b[31mWARNING: Could not fetch external catalog from VITE_CATALOG_BASE_URL: ${e.message}\x1b[0m`);
    console.log(`   \x1b[31mEnsure the CDN is deployed and the URL is correct.\x1b[0m`);
  }
} else {
  const externalMetaPath = path.resolve(rootDir, 'apps/webapp/public/catalog_meta.json');
  if (fs.existsSync(externalMetaPath)) {
    const meta = JSON.parse(fs.readFileSync(externalMetaPath, 'utf-8'));
    console.log(`✅ External Catalog (Fetched at Runtime from Local Build)`);
    console.log(`   File: apps/webapp/public/catalog.json`);
    console.log(`   Status: Generated on ${new Date(meta.generatedAt).toLocaleDateString()} (Version: ${meta.catalogVersion.substring(0,8)})`);
    console.log(`   Contents: \x1b[33m${meta.itemCount || 0} items\x1b[0m`);
  } else {
    console.log(`❌ External Catalog (Fetched at Runtime from Local Build)`);
    console.log(`   File: apps/webapp/public/catalog.json (Missing)`);
    console.log(`   \x1b[33mNote: Webapp will load without the external catalog. Run 'npm run etl' to generate it locally.\x1b[0m`);
  }
}
console.log();
