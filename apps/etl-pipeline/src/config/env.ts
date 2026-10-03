import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load the environment file using modern Node.js native APIs (Node 20.12+)
// This perfectly separates the config logic without polluting entry files or relying on third-party deps like dotenv.
export function loadEnv() {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  const rootDir = path.resolve(currentDir, '../../');
  const localEnvPath = path.resolve(rootDir, '.env.local');
  const envPath = path.resolve(rootDir, '.env');
  
  // .env.local takes precedence over .env (process.loadEnvFile does not overwrite already loaded keys)
  if (fs.existsSync(localEnvPath)) {
    process.loadEnvFile(localEnvPath);
  }
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

// Automatically load on import
loadEnv();
