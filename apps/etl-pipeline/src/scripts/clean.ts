import fs from 'fs';
import path from 'path';
import readline from 'readline';

const rootDir = path.resolve(new URL('.', import.meta.url).pathname, '../../');
const dataDir = path.join(rootDir, 'data');
const isAll = process.argv.includes('--all');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.warn('\n[!] WARNING [!]');
if (isAll) {
  console.warn('You are about to delete ALL downloaded datasets, intermediate parsing files, and generated templates.');
  console.warn('This includes the ~13GB OpenFoodFacts dataset. You will need to re-download it to regenerate templates.\n');
} else {
  console.warn('You are about to delete intermediate parsing files and generated templates.');
  console.warn('Downloaded datasets (like OpenFoodFacts) will be PRESERVED. Use --all to delete everything.\n');
}

rl.question('Are you sure you want to proceed? (y/N): ', (answer) => {
  if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
    console.log('\nCleaning up data directories...');

    // Delete temp directory
    const tempDir = path.join(dataDir, 'temp');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      console.log(' - Deleted data/temp/');
    }

    if (isAll) {
      // Delete raw directory
      const rawDir = path.join(dataDir, 'raw');
      if (fs.existsSync(rawDir)) {
        fs.rmSync(rawDir, { recursive: true, force: true });
        console.log(' - Deleted data/raw/');
      }
    }

    // Delete generated directory
    const generatedDir = path.join(dataDir, 'generated');
    if (fs.existsSync(generatedDir)) {
      fs.rmSync(generatedDir, { recursive: true, force: true });
      console.log(' - Deleted data/generated/');
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
