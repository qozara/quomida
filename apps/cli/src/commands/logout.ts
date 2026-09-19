import fs from 'fs/promises';
import { CREDENTIALS_PATH } from '../auth.js';

async function main() {
  console.log('====================================================');
  console.log('  👋 Quomida CLI - Google Auth Logout');
  console.log('====================================================');

  try {
    await fs.rm(CREDENTIALS_PATH, { force: true });
    console.log('✅ Successfully logged out. Credentials removed.');
    process.exit(0);
  } catch (err) {
    console.error('Logout failed:', err);
    process.exit(1);
  }
}

main();
