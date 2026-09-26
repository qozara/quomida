import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load the environment file using modern Node.js native APIs (Node 20.12+)
// This perfectly separates the config logic without polluting entry files or relying on third-party deps like dotenv.
export function loadEnv() {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  const envPath = path.resolve(currentDir, '../../.env');
  
  if (fs.existsSync(envPath)) {
    // process.loadEnvFile is natively supported in modern Node.js (20.12+)
    process.loadEnvFile(envPath);
  }
}

// Automatically load on import
loadEnv();
