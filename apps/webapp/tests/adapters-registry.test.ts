import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Adapter Registry', () => {
  it('should include all adapter subdirectories in index.ts', () => {
    const adaptersDir = path.join(__dirname, '../src/adapters');
    const indexPath = path.join(adaptersDir, 'index.ts');
    
    // Read all directories in src/adapters
    const entries = fs.readdirSync(adaptersDir, { withFileTypes: true });
    const adapterFolders = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    // Read index.ts
    const indexContent = fs.readFileSync(indexPath, 'utf-8');

    // Verify each folder has an import in index.ts
    for (const folder of adapterFolders) {
      expect(
        indexContent.includes(`/${folder}/`),
        `Missing registration for adapter folder: ${folder}. Make sure to import and use the adapter hook in src/adapters/index.ts`
      ).toBe(true);
    }
  });
});
