import fs from 'fs';
import path from 'path';

export async function fetchPrebuiltSystemCatalog(
  prebuiltUrl: string,
  systemOutPath: string,
  currentDir: string
): Promise<void> {
  console.log(`[ETL Pipeline] PREBUILT_SYSTEM_CATALOG_URL detected: ${prebuiltUrl}`);
  let urlToFetch = prebuiltUrl;
  if (urlToFetch.startsWith('http') && !urlToFetch.endsWith('.ndjson')) {
    urlToFetch = urlToFetch.endsWith('/') ? urlToFetch + 'catalog_system.ndjson' : urlToFetch + '/catalog_system.ndjson';
  }
  
  try {
    if (urlToFetch.startsWith('http://') || urlToFetch.startsWith('https://')) {
      const res = await fetch(urlToFetch);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      fs.writeFileSync(systemOutPath, text);
    } else {
      const localPath = urlToFetch.startsWith('file://') ? urlToFetch.replace('file://', '') : urlToFetch;
      fs.copyFileSync(path.resolve(currentDir, '../../', localPath), systemOutPath);
    }
    console.log(`[ETL Pipeline] Successfully loaded prebuilt system catalog.`);
  } catch (e) {
    console.error(`[ETL Pipeline] Failed to load prebuilt system catalog:`, e);
    process.exit(1);
  }
}
