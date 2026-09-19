import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Adapter Registry', () => {
  it('should include all provider subdirectories in index.ts', () => {
    const providersDir = path.join(__dirname, '../src/cloud-providers');
    const indexPath = path.join(providersDir, 'index.ts');
    
    // Read all directories in src/cloud-providers
    const entries = fs.readdirSync(providersDir, { withFileTypes: true });
    const providerFolders = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    // Read index.ts
    const indexContent = fs.readFileSync(indexPath, 'utf-8');

    // Verify each folder has an import in index.ts
    for (const folder of providerFolders) {
      expect(
        indexContent.includes(`/${folder}/`),
        `Missing registration for provider folder: ${folder}. Make sure to import and use the provider hook in src/cloud-providers/index.ts`
      ).toBe(true);
    }
  });
});
