import { login } from '../auth.js';

async function main() {
  console.log('====================================================');
  console.log('  🔑 Quomida CLI - Google Auth Login');
  console.log('====================================================');

  try {
    await login();
    process.exit(0);
  } catch (err) {
    console.error('Login failed:', err);
    process.exit(1);
  }
}

main();
