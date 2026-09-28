import fs from 'fs';
import readline from 'readline';
import crypto from 'crypto';
import { normalizeFoodName } from '../utils/parserUtils.js';
import type { RawIngredientItem } from '../types.js';
import type { CatalogMetaPayload } from '../index.js';
import { sanitizeIngredient, computeContentHash } from '../utils/sanitizer.js'; // I'll move these utilities to a shared file next

export async function exportSystemCatalog(
  systemInputFile: string,
  systemOutPath: string,
  systemMetaPath: string
): Promise<CatalogMetaPayload> {
  const seenKeys = new Set<string>();
  const systemCatalogItems: { id: string; hash: string }[] = [];
  let systemExportedCount = 0;

  const sysStream = fs.createWriteStream(systemOutPath, { flags: 'w' });

  if (!fs.existsSync(systemInputFile)) {
    console.warn(`[SystemExporter] System input file not found: ${systemInputFile}`);
    sysStream.end();
    return { catalogVersion: '', generatedAt: new Date().toISOString(), itemCount: 0, sources: [], fileSizeBytes: 0 };
  }

  const fileStream = fs.createReadStream(systemInputFile);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    const item: RawIngredientItem & { _type?: string } = JSON.parse(line);

    // Only process SYSTEM origin items in this exporter
    if (item.originSource !== 'SYSTEM') continue;

    const key = item._type === 'portion'
      ? `portion:${item.id}`
      : item.barcode
        ? `barcode:${item.barcode.trim()}`
        : `name:${normalizeFoodName(item.name)}`;

    if (!seenKeys.has(key)) {
      seenKeys.add(key);

      let finalItem: any;
      let contentHash = '';

      if (item._type === 'portion') {
        finalItem = item;
        contentHash = crypto.createHash('md5').update(`${item.id}|${item.name}|${(item as any).equivalent_weight_g}`, 'utf8').digest('hex');
        finalItem.contentHash = contentHash;
      } else {
        const sanitized = sanitizeIngredient(item);
        contentHash = computeContentHash(sanitized);
        finalItem = { ...sanitized, contentHash };
      }

      sysStream.write(JSON.stringify(finalItem) + '\n');
      systemCatalogItems.push({ id: finalItem.id, hash: contentHash });
      systemExportedCount++;
    }
  }

  await new Promise<void>((resolve) => sysStream.end(() => resolve()));

  const generatedAt = new Date().toISOString();
  systemCatalogItems.sort((a, b) => a.id.localeCompare(b.id));
  const systemVersion = crypto.createHash('md5').update(systemCatalogItems.map(item => `${item.id}:${item.hash}`).join(';'), 'utf8').digest('hex');
  
  const systemMeta: CatalogMetaPayload = { 
    catalogVersion: systemVersion, 
    generatedAt,
    itemCount: systemExportedCount,
    sources: ['SYSTEM'],
    fileSizeBytes: fs.statSync(systemOutPath).size
  };
  fs.writeFileSync(systemMetaPath, JSON.stringify(systemMeta, null, 2), 'utf-8');

  console.log(`[ETL Pipeline] Exported ${systemExportedCount} system items to ${systemOutPath}`);
  return systemMeta;
}
