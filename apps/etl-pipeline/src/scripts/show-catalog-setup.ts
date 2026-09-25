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
