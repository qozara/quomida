import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import '../config/env.js';

// Parse target mode: --preview, --prod, --production, or via environment variables
const args = process.argv.slice(2);
const isPreview = 
  args.includes('--preview') || 
  args.includes('preview') || 
  args.includes('--env=preview') ||
  process.env.R2_TARGET === 'preview' ||
  process.env.APP_ENV === 'preview';

const targetMode = isPreview ? 'preview' : 'production';
const prefix = isPreview ? 'PREVIEW_' : 'PROD_';

const bucketName = process.env[`${prefix}CLOUDFLARE_BUCKET_NAME`] || process.env.CLOUDFLARE_BUCKET_NAME;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const accessKeyId = process.env[`${prefix}R2_ACCESS_KEY_ID`] || process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env[`${prefix}R2_SECRET_ACCESS_KEY`] || process.env.R2_SECRET_ACCESS_KEY;

if (!bucketName || !accountId || !accessKeyId || !secretAccessKey) {
  console.error(`[R2 Upload] ERROR: Missing required environment variables for target [${targetMode.toUpperCase()}].`);
  console.error(`Please verify your environment configuration or .env file.`);
  console.error(`Expected:`);
  console.error(` - Bucket Name: ${prefix}CLOUDFLARE_BUCKET_NAME (or CLOUDFLARE_BUCKET_NAME)`);
  console.error(` - Account ID: CLOUDFLARE_ACCOUNT_ID`);
  console.error(` - Access Key ID: ${prefix}R2_ACCESS_KEY_ID (or R2_ACCESS_KEY_ID)`);
  console.error(` - Secret Access Key: ${prefix}R2_SECRET_ACCESS_KEY (or R2_SECRET_ACCESS_KEY)`);
  process.exit(1);
}

console.log(`[R2 Upload] Target Environment: \x1b[36m${targetMode.toUpperCase()}\x1b[0m`);
console.log(`[R2 Upload] Destination Bucket: \x1b[32m${bucketName}\x1b[0m`);
console.log(`[R2 Upload] Account ID: ${accountId}`);
console.log(`[R2 Upload] Access Key ID: ${accessKeyId.substring(0, 6)}...${accessKeyId.substring(accessKeyId.length - 4)}`);


const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const rootDir = path.resolve(currentDir, '../../');

const filesToUpload = [
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
  },
  {
    path: path.join(rootDir, '../webapp/src/generated/system_meta.json'),
    key: 'system_meta.json',
    contentType: 'application/json',
    description: 'system_meta.json'
  }
];

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

console.log(`[R2 Upload] Uploading artifacts to Cloudflare R2 bucket: ${bucketName}...`);
console.log(`[R2 Upload] Using S3 multipart upload API to bypass 300MB limit.`);

async function configureCors() {
  console.log(`\n[R2 Upload] Configuring bucket CORS for HTTP Range Requests...`);
  try {
    await s3Client.send(new PutBucketCorsCommand({
      Bucket: bucketName,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: ['*'],
            AllowedMethods: ['GET', 'HEAD'],
            AllowedHeaders: ['*'],
            ExposeHeaders: ['Accept-Ranges', 'Content-Range', 'Content-Length']
          }
        ]
      }
    }));
    console.log(`[R2 Upload] ✅ Successfully configured CORS`);
  } catch (err: any) {
    if (err.name === 'AccessDenied' || err.Code === 'AccessDenied') {
      console.warn(`[R2 Upload] ⚠️ Could not automatically configure CORS (Access Denied).`);
      console.warn(`[R2 Upload] ⚠️ Your R2 API Token lacks Bucket Admin permissions.`);
      console.warn(`[R2 Upload] ⚠️ IMPORTANT: You must manually configure CORS in the Cloudflare Dashboard for HTTP VFS Range Requests to work!`);
    } else {
      console.warn(`[R2 Upload] ⚠️ Failed to configure CORS:`, err.message);
    }
  }
}

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
    const fileFilter = 
      process.env.FILE ||
      process.env.UPLOAD_FILE ||
      process.env.ONLY ||
      args.find(a => a.startsWith('--file='))?.split('=')[1] ||
      args.find(a => a.startsWith('--only='))?.split('=')[1];
    const isSystemOnly = args.includes('--system-only') || process.env.SYSTEM_ONLY === 'true';

    const targetFiles = filesToUpload.filter(file => {
      if (fileFilter) {
        return file.key === fileFilter || path.basename(file.path) === fileFilter;
      }
      if (isSystemOnly) {
        return file.key === 'system.sqlite' || file.key === 'system_meta.json';
      }
      return true;
    });

    if (targetFiles.length === 0) {
      console.warn(`[R2 Upload] No files matched filter criteria.`);
      return;
    }

    const isDryRun = args.includes('--dry-run') || process.env.DRY_RUN === 'true';
    if (isDryRun) {
      console.log(`\n[R2 Upload] 🔍 DRY RUN MODE ACTIVATED - No files will be uploaded.`);
      console.log(`[R2 Upload] Target files (${targetFiles.length}):`);
      targetFiles.forEach(f => console.log(`   - ${f.key} (${f.path})`));
      return;
    }

    await configureCors();
    for (const file of targetFiles) {
      await uploadFile(file);
    }
    console.log('\n[R2 Upload] 🎉 Successfully uploaded artifacts to R2 using S3 Multipart Upload!');
  } catch (error) {
    console.error('\n[R2 Upload] Error during upload process:', error);
    process.exit(1);
  }
}

main();
