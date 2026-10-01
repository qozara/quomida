import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import '../config/env.js';

const bucketName = process.env.CLOUDFLARE_BUCKET_NAME;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;

if (!bucketName || !accountId || !apiToken) {
  console.error('[R2 Upload] ERROR: Missing required environment variables.');
  console.error('Please ensure CLOUDFLARE_BUCKET_NAME, CLOUDFLARE_ACCOUNT_ID, and CLOUDFLARE_API_TOKEN are set in your .env file.');
  process.exit(1);
}

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const rootDir = path.resolve(currentDir, '../../');

const sqliteFile = path.join(rootDir, 'dist-cdn/catalog.sqlite');
const sqliteGzFile = path.join(rootDir, 'dist-cdn/catalog.sqlite.gz');
const metaFile = path.join(rootDir, 'dist-cdn/catalog_meta.json');

console.log(`[R2 Upload] Uploading artifacts to Cloudflare R2 bucket: ${bucketName}...`);

try {
  const sqliteCmd = `npx --yes wrangler r2 object put ${bucketName}/catalog.sqlite --file="${sqliteFile}" --content-type=application/x-sqlite3 --remote`;
  console.log('\n[R2 Upload] Uploading catalog.sqlite (Uncompressed for HTTP VFS fallback)...');
  console.log(`[R2 Upload] Executing: ${sqliteCmd}`);
  execSync(sqliteCmd, { stdio: 'inherit' });

  const sqliteGzCmd = `npx --yes wrangler r2 object put ${bucketName}/catalog.sqlite.gz --file="${sqliteGzFile}" --content-type=application/gzip --remote`;
  console.log('\n[R2 Upload] Uploading catalog.sqlite.gz (Compressed for OPFS Download)...');
  console.log(`[R2 Upload] Executing: ${sqliteGzCmd}`);
  execSync(sqliteGzCmd, { stdio: 'inherit' });

  const metaCmd = `npx --yes wrangler r2 object put ${bucketName}/catalog_meta.json --file="${metaFile}" --content-type=application/json --remote`;
  console.log('\n[R2 Upload] Uploading catalog_meta.json...');
  console.log(`[R2 Upload] Executing: ${metaCmd}`);
  execSync(metaCmd, { stdio: 'inherit' });

  console.log('\n[R2 Upload] Successfully uploaded all artifacts to R2!');
} catch (error) {
  console.error('\n[R2 Upload] Error during upload:', error);
  process.exit(1);
}
