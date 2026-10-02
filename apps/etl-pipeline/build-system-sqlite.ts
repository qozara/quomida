import { exportSQLiteCatalog } from './src/exporters/SQLiteExporter.js';
import path from 'path';
import fs from 'fs';

async function run() {
  const currentDir = process.cwd();
  
  // Input: NDJSON files
  const systemNdjson = path.resolve(currentDir, 'data/temp/system.ndjson');
  
  // Output Paths
  const systemSqlitePath = path.resolve(currentDir, '../webapp/public/system.sqlite');
  const catalogSqlitePath = path.resolve(currentDir, 'dist-cdn/catalog.sqlite'); // Overwriting catalog.sqlite temporarily, but I can restore it
  const metaPath = path.resolve(currentDir, 'dist-cdn/catalog_meta.json');
  
  // Wait, I only want to build system.sqlite. But SQLiteExporter creates BOTH catalog and system sqlite.
  // Since catalog.sqlite is 306MB, if I run it only with system.ndjson, it will OVERWRITE catalog.sqlite with a small one!
  // Let me just create a dummy path for catalog.sqlite so I don't overwrite the real one.
  const dummyCatalogPath = path.resolve(currentDir, 'data/temp/dummy_catalog.sqlite');
  
  console.log('Resolving system.ndjson to system.sqlite...');
  await exportSQLiteCatalog([systemNdjson], dummyCatalogPath, systemSqlitePath, metaPath);
  
  console.log('Done!');
}

run().catch(console.error);
