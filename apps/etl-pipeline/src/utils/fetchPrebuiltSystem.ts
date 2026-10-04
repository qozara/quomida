import fs from 'fs';
import path from 'path';

export async function fetchPrebuiltSystemCatalog(
  prebuiltUrl: string,
  systemOutPath: string,
  currentDir: string
): Promise<void> {
  console.log(`[ETL Pipeline] PREBUILT_SYSTEM_CATALOG_URL detected: ${prebuiltUrl}`);
  let urlToFetch = prebuiltUrl;
  if (urlToFetch.endsWith('system_meta.json')) {
    urlToFetch = urlToFetch.replace(/system_meta\.json$/, 'system.sqlite');
  } else if (urlToFetch.startsWith('http') && !urlToFetch.endsWith('.ndjson') && !urlToFetch.endsWith('.sqlite')) {
    urlToFetch = urlToFetch.endsWith('/') ? urlToFetch + 'system.sqlite' : urlToFetch + '/system.sqlite';
  }
  
  try {
    if (urlToFetch.startsWith('http://') || urlToFetch.startsWith('https://')) {
      const res = await fetch(urlToFetch);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = await res.arrayBuffer();
      fs.writeFileSync(systemOutPath, Buffer.from(buffer));
    } else {
      const localPath = urlToFetch.startsWith('file://') ? urlToFetch.replace('file://', '') : urlToFetch;
      fs.copyFileSync(path.resolve(currentDir, '../../', localPath), systemOutPath);
    }
  } catch (err: any) {
    console.error(`[ETL Pipeline] Failed to download prebuilt system catalog:`, err.message);
    process.exit(1);
  }
  // Ensure destination directory for webapp metadata exists
  const webappGeneratedDir = path.resolve(path.dirname(systemOutPath), '../src/generated');
  if (!fs.existsSync(webappGeneratedDir)) {
    fs.mkdirSync(webappGeneratedDir, { recursive: true });
  }
  const metaOutPath = path.join(webappGeneratedDir, 'system_meta.json');

  let metaLoaded = false;

  // Attempt to fetch prebuilt metadata directly from remote / companion file (zero SQL required)
  if (urlToFetch.startsWith('http://') || urlToFetch.startsWith('https://')) {
    const metaUrl = urlToFetch.replace(/system\.sqlite$/, 'system_meta.json');
    try {
      console.log(`[ETL Pipeline] Fetching prebuilt system metadata: ${metaUrl}`);
      const metaRes = await fetch(metaUrl);
      if (metaRes.ok) {
        const metaJson = await metaRes.json();
        fs.writeFileSync(metaOutPath, JSON.stringify(metaJson, null, 2), 'utf-8');
        metaLoaded = true;
        console.log(`[ETL Pipeline] Successfully fetched prebuilt system metadata (${metaJson.itemCount} items). Zero SQL required.`);
      } else {
        console.warn(`[ETL Pipeline] Remote system_meta.json returned HTTP ${metaRes.status}.`);
      }
    } catch (err: any) {
      console.warn(`[ETL Pipeline] Could not fetch remote system_meta.json: ${err.message}`);
    }
  } else {
    const localMetaPath = urlToFetch.replace('file://', '').replace(/system\.sqlite$/, 'system_meta.json');
    const resolvedLocalMeta = path.resolve(currentDir, '../../', localMetaPath);
    if (fs.existsSync(resolvedLocalMeta)) {
      fs.copyFileSync(resolvedLocalMeta, metaOutPath);
      metaLoaded = true;
      console.log(`[ETL Pipeline] Copied local prebuilt system metadata.`);
    }
  }

  // Fallback if system_meta.json was not available alongside prebuilt binary
  if (!metaLoaded) {
    try {
      // Try local better-sqlite3 query if available in environment
      const Database = (await import('better-sqlite3')).default;
      const db = new Database(systemOutPath);
      const { writeSystemCatalogMetadata } = await import('../exporters/SQLiteExporter.js');
      const meta = writeSystemCatalogMetadata(db, systemOutPath);
      db.close();
      console.log(`[ETL Pipeline] Generated metadata via local sqlite (${meta.itemCount} items).`);
    } catch (err: any) {
      console.error(`[ETL Pipeline] Fatal error: Could not fetch remote system_meta.json and failed to inspect sqlite locally using better-sqlite3: ${err.message}`);
      process.exit(1);
    }
  }
}
