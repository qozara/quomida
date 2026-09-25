import fs from 'fs';
import path from 'path';
import readline from 'readline';

const rootDir = path.resolve(new URL('.', import.meta.url).pathname, '../../');
const dataDir = path.join(rootDir, 'data');
const rawOffDir = path.join(dataDir, 'raw', 'openfoodfacts');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.warn('\n[!] WARNING [!]');
console.warn('You are about to delete ALL downloaded datasets, intermediate parsing files, and generated templates.');
console.warn('This includes the ~13GB OpenFoodFacts dataset. You will need to re-download it to regenerate templates.\n');

rl.question('Are you sure you want to proceed? (y/N): ', (answer) => {
  if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
    console.log('\nCleaning up data directories...');

    // Delete temp directory
    const tempDir = path.join(dataDir, 'temp');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      console.log(' - Deleted data/temp/');
    }

    // Delete raw directory
    const rawDir = path.join(dataDir, 'raw');
    if (fs.existsSync(rawDir)) {
      fs.rmSync(rawDir, { recursive: true, force: true });
      console.log(' - Deleted data/raw/');
    }

    // Delete templates directory
    const templatesDir = path.join(dataDir, 'templates');
    if (fs.existsSync(templatesDir)) {
      fs.rmSync(templatesDir, { recursive: true, force: true });
      console.log(' - Deleted data/templates/');
    }

    // Delete state file
    const stateFile = path.join(dataDir, '.state.json');
    if (fs.existsSync(stateFile)) {
      fs.unlinkSync(stateFile);
      console.log(' - Deleted data/.state.json');
    }

    console.log('\nClean complete!');
  } else {
    console.log('\nClean aborted.');
  }
  rl.close();
});
