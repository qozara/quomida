import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import '../config/env.js';

const bucketName = process.env.CLOUDFLARE_BUCKET_NAME;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
// We now require S3-compatible credentials to bypass the 300MB Wrangler limit
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

if (!bucketName || !accountId || !accessKeyId || !secretAccessKey) {
  console.error('[R2 Upload] ERROR: Missing required environment variables for S3 API upload.');
  console.error('Please ensure CLOUDFLARE_BUCKET_NAME, CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY are set in your .env file.');
  console.error('Note: You must generate S3-compatible API credentials in the Cloudflare Dashboard (API Tokens -> R2 API Tokens).');
  process.exit(1);
}

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const rootDir = path.resolve(currentDir, '../../');

const filesToUpload = [
  {
    path: path.join(rootDir, 'dist-cdn/catalog.sqlite'),
    key: 'catalog.sqlite',
    contentType: 'application/x-sqlite3',
    description: 'catalog.sqlite (Uncompressed for HTTP VFS fallback)'
  },
  {
    path: path.join(rootDir, 'dist-cdn/catalog.sqlite.gz'),
    key: 'catalog.sqlite.gz',
    contentType: 'application/gzip',
    description: 'catalog.sqlite.gz (Compressed for OPFS Download)'
  },
  {
    path: path.join(rootDir, 'dist-cdn/catalog_meta.json'),
    key: 'catalog_meta.json',
    contentType: 'application/json',
    description: 'catalog_meta.json'
  },
  {
    path: path.join(rootDir, '../webapp/public/system.sqlite'),
    key: 'system.sqlite',
    contentType: 'application/x-sqlite3',
    description: 'system.sqlite'
  }
];

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

console.log(`[R2 Upload] Uploading artifacts to Cloudflare R2 bucket: ${bucketName}...`);
console.log(`[R2 Upload] Using S3 multipart upload API to bypass 300MB limit.`);

async function uploadFile(file: typeof filesToUpload[0]) {
  if (!fs.existsSync(file.path)) {
    console.warn(`[R2 Upload] WARNING: File not found, skipping: ${file.path}`);
    return;
  }

  console.log(`\n[R2 Upload] Uploading ${file.description}...`);
  const fileStream = fs.createReadStream(file.path);
  const fileSize = fs.statSync(file.path).size;

  try {
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: bucketName,
        Key: file.key,
        Body: fileStream,
        ContentType: file.contentType,
      },
      tags: [], 
      queueSize: 4, 
      partSize: 50 * 1024 * 1024, // 50 MB
      leavePartsOnError: false, 
    });

    upload.on('httpUploadProgress', (progress) => {
      if (progress.loaded && progress.total) {
        const percent = Math.round((progress.loaded / progress.total) * 100);
        process.stdout.write(`\r   Progress: ${percent}% (${(progress.loaded / 1024 / 1024).toFixed(2)}MB / ${(progress.total / 1024 / 1024).toFixed(2)}MB)`);
      }
    });

    await upload.done();
    console.log(`\n[R2 Upload] ✅ Successfully uploaded ${file.key}`);
  } catch (err) {
    console.error(`\n[R2 Upload] ❌ Failed to upload ${file.key}:`, err);
    throw err;
  }
}

async function main() {
  try {
    for (const file of filesToUpload) {
      await uploadFile(file);
    }
    console.log('\n[R2 Upload] 🎉 Successfully uploaded all artifacts to R2 using S3 Multipart Upload!');
  } catch (error) {
    console.error('\n[R2 Upload] Error during upload process:', error);
    process.exit(1);
  }
}

main();
